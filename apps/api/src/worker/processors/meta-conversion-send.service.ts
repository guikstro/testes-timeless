import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { MetaGraphClient } from "../../integrations/meta/meta-graph-client";
import { MetaConversionEventPayload } from "../../integrations/meta/meta-graph-types";
import { META_EVENT_NAME_BY_TYPE } from "../../integrations/meta/meta-event-names";
import { buildMetaEventId } from "../../common/utils/build-meta-event-id";
import { hashPhoneForMeta } from "../../common/utils/hash-phone-for-meta";

type ConversionEventWithLead = Prisma.ConversionEventGetPayload<{
  include: { lead: { include: { attribution: true } } };
}>;

/**
 * Sends one ConversionEvent to Meta and records the outcome. Re-checks the
 * connection's live status at execution time rather than trusting whatever
 * it was at enqueue time — the same lesson Fase 6 learned the hard way for
 * meta-sync.service.ts (a disconnect can race a delayed retry) is applied
 * here from the start. See docs/META_CAPI.md.
 */
@Injectable()
export class MetaConversionSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly metaGraphClient: MetaGraphClient,
  ) {}

  async send(conversionEventId: string, isLastAttempt: boolean): Promise<void> {
    const event = await this.prisma.conversionEvent.findUnique({
      where: { id: conversionEventId },
      include: { lead: { include: { attribution: true } } },
    });
    if (!event || event.status === "SENT") {
      // Deleted, or an earlier attempt's success update already landed —
      // never send the same event to Meta twice.
      return;
    }

    const connection = await this.prisma.metaConnection.findUnique({ where: { organizationId: event.organizationId } });
    if (!connection || connection.status === "DISCONNECTED" || !connection.pixelId || !connection.capiAccessTokenEncrypted) {
      await this.prisma.conversionEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          lastError: "Conexão com a Meta desconectada ou Conversions API não configurada.",
        },
      });
      return;
    }

    if (event.type === "PURCHASE" && (event.valueCents === null || event.currency === null)) {
      // Should never happen — ConversionEventsService.recordPurchase always
      // sets both together — but Meta must never receive a valueless
      // Purchase, so fail loudly instead of sending a malformed event.
      await this.prisma.conversionEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: "Venda sem valor definido — evento não enviado." },
      });
      return;
    }

    const accessToken = this.encryption.decrypt(connection.capiAccessTokenEncrypted);
    const payload = this.buildPayload(event);

    try {
      await this.metaGraphClient.sendConversionEvent(connection.pixelId, accessToken, payload);
      await this.prisma.conversionEvent.update({
        where: { id: event.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao enviar evento para a Meta.";
      await this.prisma.conversionEvent.update({
        where: { id: event.id },
        data: { status: isLastAttempt ? "FAILED" : "RETRYING", attempts: { increment: 1 }, lastError: message },
      });
      throw error; // let BullMQ retry per the job's configured attempts/backoff
    }
  }

  private buildPayload(event: ConversionEventWithLead): MetaConversionEventPayload {
    const userData: MetaConversionEventPayload["user_data"] = { ph: [hashPhoneForMeta(event.lead.normalizedPhone)] };

    const isCtwa = event.lead.attribution?.method === "CTWA_REFERRAL";
    const evidence = isCtwa ? (event.lead.attribution!.evidence as { ctwaClid?: string } | null) : null;
    if (evidence?.ctwaClid) {
      userData.ctwa_clid = evidence.ctwaClid;
    }

    return {
      event_name: META_EVENT_NAME_BY_TYPE[event.type],
      event_time: Math.floor(event.occurredAt.getTime() / 1000),
      event_id: buildMetaEventId(event.leadId, event.type),
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: userData,
      ...(event.type === "PURCHASE" ? { custom_data: { value: event.valueCents! / 100, currency: event.currency! } } : {}),
    };
  }
}
