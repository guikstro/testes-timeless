import { Injectable, Logger } from "@nestjs/common";
import { Message } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { normalizePhone } from "../../common/utils/normalize-phone";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { WhatsAppInboundMessageJob } from "../../common/queue/whatsapp-event.job";
import { AttributionEngine } from "../../attribution/attribution-engine";
import { ConversationClassifierService } from "../../classification/conversation-classifier.service";
import { ConversionEventsService } from "../../integrations/meta/conversion-events.service";

@Injectable()
export class WhatsAppIngestionService {
  private readonly logger = new Logger(WhatsAppIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attributionEngine: AttributionEngine,
    private readonly classifier: ConversationClassifierService,
    private readonly conversionEvents: ConversionEventsService,
  ) {}

  /**
   * Idempotent end-to-end: a message already recorded (by external_id) is a
   * no-op, and every find-or-create step below is race-safe against a
   * concurrent delivery for the same phone number. See docs/WHATSAPP.md.
   */
  async ingest(job: WhatsAppInboundMessageJob): Promise<void> {
    const alreadyProcessed = await this.prisma.message.findUnique({ where: { externalId: job.messageId } });
    if (alreadyProcessed) {
      this.logger.log(JSON.stringify({ event: "duplicate_message_skipped", messageId: job.messageId }));
      return;
    }

    // A chave de roteamento multi-tenant depende do transporte: a Cloud API
    // roteia pelo `phone_number_id` da Meta, a Evolution pelo nome da
    // instância. Ambas são colunas únicas, então nenhuma das duas pode
    // apontar para duas organizações.
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where:
        job.provider === "CLOUD_API"
          ? { phoneNumberId: job.routingKey }
          : { instanceName: job.routingKey },
    });
    if (!connection) {
      // We genuinely don't know which tenant this belongs to — there is
      // nothing safe to do but drop it. This should only happen for a
      // routing key that was never connected in this app.
      this.logger.warn(
        JSON.stringify({
          event: "unknown_routing_key",
          provider: job.provider,
          routingKey: job.routingKey,
          messageId: job.messageId,
        }),
      );
      return;
    }

    const organizationId = connection.organizationId;
    const normalizedPhone = normalizePhone(job.waId);
    const occurredAt = new Date(job.timestampSeconds * 1000);

    const { lead, wasCreated: leadWasCreated } = await this.findOrCreateLead(
      organizationId,
      normalizedPhone,
      job.waId,
      job.profileName,
      occurredAt,
    );

    if (leadWasCreated) {
      await this.prisma.leadEvent.create({
        data: { organizationId, leadId: lead.id, type: "LEAD_CREATED", occurredAt },
      });
      // First-touch, computed once from exactly this message's evidence and
      // never revisited afterward (Section 31) — see AttributionEngine.
      // Recorded before the Meta Lead event so a same-lead conversion send
      // can already see the ctwa_clid, if any, on first attempt.
      await this.attributeLead(organizationId, lead.id, job);
      await this.conversionEvents.recordLead(organizationId, lead.id, occurredAt);
    }

    const { conversation, wasCreated: conversationWasCreated } = await this.findOrCreateConversation(
      organizationId,
      lead.id,
      connection.id,
      occurredAt,
    );

    if (conversationWasCreated) {
      await this.prisma.leadEvent.create({
        data: { organizationId, leadId: lead.id, type: "CONVERSATION_STARTED", occurredAt },
      });
    }

    const message = await this.createMessageIfAbsent(conversation.id, job, occurredAt);
    if (!message) {
      // Lost a race with another concurrent delivery of the same message.
      return;
    }

    await this.prisma.leadEvent.create({
      data: {
        organizationId,
        leadId: lead.id,
        type: "MESSAGE_RECEIVED",
        metadata: { messageId: job.messageId },
        occurredAt,
      },
    });

    // Runs on every message, not just the first — qualification/sale can
    // happen at any point in the conversation (unlike attribution).
    await this.classifier.classify({
      organizationId,
      lead,
      messageId: message.id,
      messageText: job.type === "text" ? job.text : undefined,
      occurredAt,
      // A ingestão só recebe mensagens do lead: o parser descarta `fromMe`.
      direction: "INBOUND",
    });

    await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: { lastEventAt: new Date() },
    });
  }

  private async attributeLead(organizationId: string, leadId: string, job: WhatsAppInboundMessageJob): Promise<void> {
    const result = await this.attributionEngine.resolve({
      organizationId,
      messageText: job.text,
      referral: job.referral,
    });

    try {
      await this.prisma.attribution.create({
        data: {
          organizationId,
          leadId,
          method: result.method,
          confidence: result.confidence,
          trackingClickId: result.trackingClickId,
          evidence: result.evidence,
        },
      });
    } catch (error) {
      // Defensive only: leadWasCreated is itself race-protected, so this
      // should never actually fire — but a first-touch attribution must
      // never be overwritten (Section 31), so if it somehow does, skip.
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  private async findOrCreateLead(
    organizationId: string,
    normalizedPhone: string,
    rawPhone: string,
    profileName: string | undefined,
    occurredAt: Date,
  ) {
    const existing = await this.prisma.lead.findUnique({
      where: { organizationId_normalizedPhone: { organizationId, normalizedPhone } },
    });

    if (existing) {
      const updated = await this.prisma.lead.update({
        where: { id: existing.id },
        data: {
          lastContactAt: occurredAt > existing.lastContactAt ? occurredAt : existing.lastContactAt,
          ...(profileName && !existing.name ? { name: profileName } : {}),
        },
      });
      return { lead: updated, wasCreated: false };
    }

    try {
      const created = await this.prisma.lead.create({
        data: {
          organizationId,
          normalizedPhone,
          rawPhone,
          name: profileName,
          firstContactAt: occurredAt,
          lastContactAt: occurredAt,
        },
      });
      return { lead: created, wasCreated: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Lost the race to another concurrent event for the same phone number.
      const lead = await this.prisma.lead.findUniqueOrThrow({
        where: { organizationId_normalizedPhone: { organizationId, normalizedPhone } },
      });
      return { lead, wasCreated: false };
    }
  }

  private async findOrCreateConversation(
    organizationId: string,
    leadId: string,
    whatsappConnectionId: string,
    occurredAt: Date,
  ) {
    // Simplification for this phase: one conversation per (lead, connection)
    // pair, reused indefinitely — see docs/WHATSAPP.md for why splitting
    // into multiple time-boxed conversation "sessions" is deferred.
    const existing = await this.prisma.conversation.findFirst({ where: { leadId, whatsappConnectionId } });

    if (existing) {
      const updated = await this.prisma.conversation.update({
        where: { id: existing.id },
        data: { lastMessageAt: occurredAt > existing.lastMessageAt ? occurredAt : existing.lastMessageAt },
      });
      return { conversation: updated, wasCreated: false };
    }

    try {
      const created = await this.prisma.conversation.create({
        data: { organizationId, leadId, whatsappConnectionId, startedAt: occurredAt, lastMessageAt: occurredAt },
      });
      return { conversation: created, wasCreated: true };
    } catch {
      // Lost a race with a concurrent first message for the same lead.
      const conversation = await this.prisma.conversation.findFirstOrThrow({
        where: { leadId, whatsappConnectionId },
      });
      return { conversation, wasCreated: false };
    }
  }

  private async createMessageIfAbsent(
    conversationId: string,
    job: WhatsAppInboundMessageJob,
    occurredAt: Date,
  ): Promise<Message | null> {
    try {
      return await this.prisma.message.create({
        data: {
          conversationId,
          externalId: job.messageId,
          direction: "INBOUND",
          type: job.type === "text" ? "TEXT" : "OTHER",
          text: job.type === "text" ? job.text : undefined,
          timestamp: occurredAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    }
  }
}
