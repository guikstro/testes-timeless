import { HttpStatus, Injectable } from "@nestjs/common";
import { LeadStatus, Prisma } from "@prisma/client";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { NotificationsService } from "../notifications/notifications.service";
import { ANUNCIO_POR_ESTAGIO } from "../notifications/notification-event";
import { PaginatedResult, PaginationQueryDto } from "../common/dto/pagination.dto";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";
import { WHATSAPP_SEND_QUEUE } from "../common/queue/queue.constants";
import { WhatsAppSendJob } from "../common/queue/whatsapp-send.job";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { ListLeadsDto } from "./dto/list-leads.dto";
import { computeLeadMetrics } from "./lead-metrics";
import { expedienteDa, SELECAO_DE_EXPEDIENTE } from "../common/expediente-da-organizacao";
import { AdIds, AdReferences, extractAdIds } from "./ad-references";

/**
 * A ordem do funil vive aqui, não na ordem do enum no Postgres: `ADD VALUE`
 * acrescenta ao fim do tipo, então MEETING_SCHEDULED aparece depois de WON lá.
 * Nada consulta ordenando por status no banco — quem decide avanço é este mapa.
 */
/**
 * Achata as conversas numa única "última mensagem".
 *
 * A tela não precisa saber que um lead pode ter mais de uma conversa; ela
 * precisa da fala mais recente e de quem a disse. `awaitingReply` sai daí:
 * se a última é do lead, a bola está com a equipe.
 */
type ComConversas = { conversations?: { messages: { direction: string; text: string | null; timestamp: Date }[] }[] };

function comUltimaMensagem<T extends ComConversas>(lead: T) {
  const ultimas = (lead.conversations ?? [])
    .map((conversa) => conversa.messages[0])
    .filter((mensagem): mensagem is NonNullable<typeof mensagem> => Boolean(mensagem))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const ultima = ultimas[0] ?? null;
  const { conversations: _descartado, ...resto } = lead;

  return {
    ...resto,
    lastMessage: ultima ? { text: ultima.text, direction: ultima.direction, timestamp: ultima.timestamp } : null,
    awaitingReply: ultima?.direction === "INBOUND",
  };
}

const STATUS_ORDER: Record<LeadStatus, number> = {
  NEW: 0,
  QUALIFIED: 1,
  MEETING_SCHEDULED: 2,
  WON: 3,
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionEvents: ConversionEventsService,
    @InjectQueue(WHATSAPP_SEND_QUEUE) private readonly sendQueue: Queue<WhatsAppSendJob>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(organizationId: string, query: ListLeadsDto): Promise<PaginatedResult<unknown>> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const termo = query.search?.trim();

    const where: Prisma.LeadWhereInput = { organizationId };

    if (termo) {
      // Telefone é buscado só pelos dígitos: quem digita "85 99999" espera
      // achar "+5585999999999", e comparar as duas formas cruas nunca casaria.
      const digitos = termo.replace(/\D/g, "");
      where.OR = [
        { name: { contains: termo, mode: "insensitive" } },
        ...(digitos ? [{ normalizedPhone: { contains: digitos } }] : []),
      ];
    }

    if (query.status === "DISQUALIFIED") {
      where.disqualifiedAt = { not: null };
    } else if (query.status && query.status !== "AWAITING") {
      where.status = query.status;
      // Um lead descartado não aparece no estágio em que parou: quem filtra
      // por "Qualificado" quer trabalhar a lista, não revisar o que foi
      // descartado.
      where.disqualifiedAt = null;
    }

    // "Aguardando" depende da ÚLTIMA mensagem de cada conversa, que o Prisma
    // não sabe comparar num `where`. O caminho é trazer a última de cada uma
    // e filtrar depois, então ele vive separado para não penalizar os outros
    // filtros com um include que eles não usam.
    if (query.status === "AWAITING") {
      const candidatos = await this.prisma.lead.findMany({
        where: { ...where, disqualifiedAt: null },
        include: {
          attribution: true,
          sale: true,
          conversations: { select: { messages: { orderBy: { timestamp: "desc" }, take: 1 } } },
        },
        orderBy: { lastContactAt: "desc" },
      });

      const aguardando = candidatos.filter((lead) =>
        lead.conversations.some((conversa) => conversa.messages[0]?.direction === "INBOUND"),
      );

      return {
        items: aguardando.slice(offset, offset + limit).map(comUltimaMensagem),
        total: aguardando.length,
        offset,
        limit,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          attribution: true,
          sale: true,
          // A última mensagem de cada conversa. É o que faz decidir se vale
          // abrir o lead, e sem ela a lista obriga a entrar em cada um para
          // descobrir do que se trata.
          conversations: {
            select: { messages: { orderBy: { timestamp: "desc" }, take: 1 } },
          },
        },
        orderBy: { lastContactAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items: items.map(comUltimaMensagem), total, offset, limit };
  }

  async findOne(organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        attribution: { include: { trackingClick: { include: { trackingLink: true } } } },
        sale: true,
        // O sinal que voltou para a Meta faz parte da ficha do lead: sem ele
        // não há como saber se a conversão chegou ao algoritmo que o cliente
        // está pagando para otimizar.
        conversionEvents: { orderBy: { occurredAt: "asc" } },
      },
    });
    if (!lead) {
      throw new AppException("NOT_FOUND", "Lead não encontrado.", HttpStatus.NOT_FOUND);
    }

    const [events, messages] = await Promise.all([
      // `sequence` desempata: vários eventos de uma mesma mensagem
      // compartilham o `occurredAt` dela (que vem do WhatsApp, não do nosso
      // relógio) e frequentemente o `createdAt` também, que só tem precisão
      // de milissegundos. Sem um contador monotônico, o Postgres devolvia
      // ordem arbitrária e a tela chegava a mostrar a venda antes da
      // mensagem que a originou.
      this.prisma.leadEvent.findMany({
        where: { leadId: id },
        orderBy: [{ occurredAt: "asc" }, { sequence: "asc" }],
        // Detalhe interno de ordenação, e um BigInt que o JSON.stringify do
        // Nest não sabe serializar — nunca deve sair na resposta.
        omit: { sequence: true },
      }),
      this.prisma.message.findMany({
        where: { conversation: { leadId: id } },
        orderBy: [{ timestamp: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const adReferences = await this.resolveAdReferences(organizationId, extractAdIds(lead.attribution));
    // O expediente vem junto para o tempo de resposta não contar a
    // madrugada de quem não atende de madrugada.
    const organizacao = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: SELECAO_DE_EXPEDIENTE,
    });

    const metrics = computeLeadMetrics(
      lead,
      messages,
      lead.attribution?.trackingClick?.clickedAt ?? null,
      expedienteDa(organizacao),
    );

    return { ...lead, events, messages, metrics, adReferences };
  }

  /**
   * Um clique guarda só os ids numéricos da Meta. Os nomes vivem nas tabelas
   * que a integração sincroniza — e podem não existir, porque sincronizar é
   * opcional e um anúncio criado depois da última sincronização ainda não tem
   * linha aqui. Quando o nome falta devolvemos o id cru: pior que um nome,
   * muito melhor que um campo vazio na tela.
   *
   * A partir do `adId` a hierarquia inteira sai numa consulta só; a campanha
   * é tentada à parte para o caso de o anúncio específico não ter sido
   * capturado mas a campanha sim.
   */
  private async resolveAdReferences(organizationId: string, ids: AdIds): Promise<AdReferences> {
    const rawIds: AdReferences = {
      campaign: ids.campaignId ? { externalId: ids.campaignId, name: null } : null,
      adSet: ids.adsetId ? { externalId: ids.adsetId, name: null } : null,
      ad: ids.adId ? { externalId: ids.adId, name: null } : null,
    };

    if (ids.adId) {
      // O escopo entra na própria consulta, e não numa conferência depois.
      // Ad e AdSet não carregam organizationId: o vínculo existe só na
      // campanha, e é por ela que a busca desce. Filtrar aqui é o que impede
      // um id de outra conta de revelar o nome do anúncio dela.
      const ad = await this.prisma.ad.findFirst({
        where: { externalId: ids.adId, adSet: { campaign: { organizationId } } },
        include: { adSet: { include: { campaign: true } } },
      });
      if (ad) {
        return {
          campaign: { externalId: ad.adSet.campaign.externalId, name: ad.adSet.campaign.name },
          adSet: { externalId: ad.adSet.externalId, name: ad.adSet.name },
          ad: { externalId: ad.externalId, name: ad.name },
        };
      }
    }

    if (ids.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { externalId: ids.campaignId, organizationId },
      });
      if (campaign) {
        return { ...rawIds, campaign: { externalId: campaign.externalId, name: campaign.name } };
      }
    }

    return rawIds;
  }

  /**
   * Manual correction (Section 64) — "não criar um CRM completo", só o
   * necessário para consertar um estágio/valor que o tracking automático
   * errou. Every change is audited (Section 65) and mirrored into the
   * lead's timeline so it's visible in the same place as automatic events.
   */
  async update(organizationId: string, id: string, userId: string, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId }, include: { sale: true } });
    if (!lead) {
      throw new AppException("NOT_FOUND", "Lead não encontrado.", HttpStatus.NOT_FOUND);
    }

    if (dto.status) {
      this.assertForwardTransition(lead.status, dto.status);
    }
    // Uma venda registrada contradiz "não era oportunidade". Bloquear aqui
    // evita um lead que aparece como vendido e descartado ao mesmo tempo.
    if (dto.disqualified === true && (lead.status === "WON" || dto.status === "WON")) {
      throw new AppException(
        "CANNOT_DISQUALIFY_WON",
        "Não é possível desqualificar um lead que já comprou.",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.revenueCents !== undefined && dto.status !== "WON" && lead.status !== "WON") {
      throw new AppException(
        "NO_SALE",
        "Não é possível definir receita para um lead sem venda registrada.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const beforeStatus = lead.status;
    const data: Prisma.LeadUpdateInput = {};
    let becameQualified = false;
    let becameWon = false;
    let scheduledMeeting = false;

    if (dto.status === "QUALIFIED" && lead.status === "NEW") {
      data.status = "QUALIFIED";
      data.qualifiedAt = lead.qualifiedAt ?? now;
      becameQualified = true;
    }

    if (dto.status === "MEETING_SCHEDULED" && STATUS_ORDER[lead.status] < STATUS_ORDER.MEETING_SCHEDULED) {
      data.status = "MEETING_SCHEDULED";
      data.meetingScheduledAt = now;
      scheduledMeeting = true;
      // Combinar horário com alguém pressupõe tê-lo qualificado, mesmo que
      // nenhuma mensagem de qualificação tenha sido registrada antes.
      if (!lead.qualifiedAt) {
        data.qualifiedAt = now;
        becameQualified = true;
      }
    }

    if (dto.status === "WON" && lead.status !== "WON") {
      data.status = "WON";
      data.wonAt = now;
      if (!lead.qualifiedAt) {
        data.qualifiedAt = now;
        becameQualified = true;
      }
      // `meetingScheduledAt` de propósito não é preenchido aqui: qualificação
      // é pressuposto de uma venda, reunião não é. Vender sem reunião é comum,
      // e inventar uma falsearia o funil de reuniões.
      becameWon = true;
    }

    // Avançar no funil desfaz a desqualificação: se a pessoa voltou e comprou,
    // exigir dois passos ("reative, depois marque") seria atrito sem ganho —
    // a intenção de quem clicou já é inequívoca.
    const reactivatedByProgress = Boolean(data.status) && Boolean(lead.disqualifiedAt);
    if (reactivatedByProgress) {
      data.disqualifiedAt = null;
      data.disqualifiedReason = null;
    }

    if (dto.disqualified === true && !lead.disqualifiedAt) {
      data.disqualifiedAt = now;
      data.disqualifiedReason = dto.disqualifiedReason?.trim() || null;
    }
    if (dto.disqualified === false && lead.disqualifiedAt) {
      data.disqualifiedAt = null;
      data.disqualifiedReason = null;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.lead.update({ where: { id }, data });
    }

    if (scheduledMeeting) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "MEETING_SCHEDULED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId },
        },
      });
    }

    if (data.disqualifiedAt instanceof Date) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "DISQUALIFIED",
          occurredAt: now,
          metadata: { userId, reason: data.disqualifiedReason ?? null },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Lead",
          entityId: id,
          action: "LEAD_DISQUALIFIED",
          after: { reason: data.disqualifiedReason ?? null },
        },
      });
    }

    if (data.disqualifiedAt === null && lead.disqualifiedAt) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "REACTIVATED",
          occurredAt: now,
          metadata: { userId, byProgress: reactivatedByProgress },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Lead",
          entityId: id,
          action: "LEAD_REACTIVATED",
          before: { reason: lead.disqualifiedReason },
        },
      });
    }

    if (becameQualified) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "QUALIFIED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId },
        },
      });
      await this.conversionEvents.recordQualifiedLead(organizationId, id, now);
    }

    let sale = lead.sale;

    if (becameWon) {
      sale = await this.prisma.sale.create({
        data: {
          organizationId,
          leadId: id,
          amountCents: dto.revenueCents ?? null,
          classifierType: "MANUAL",
          detectedAt: now,
        },
      });
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "SALE_DETECTED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Sale",
          entityId: sale.id,
          action: "SALE_CREATED",
          after: { amountCents: sale.amountCents },
        },
      });
      // Only sent once a value is known (Section: never guess) — a WON
      // correction with no revenueCents waits for a later correction below.
      if (dto.revenueCents !== undefined) {
        await this.conversionEvents.recordPurchase(organizationId, id, now, dto.revenueCents);
      }
    } else if (dto.revenueCents !== undefined && sale) {
      const before = { amountCents: sale.amountCents };
      sale = await this.prisma.sale.update({ where: { id: sale.id }, data: { amountCents: dto.revenueCents } });
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "REVENUE_DETECTED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId, amountCents: dto.revenueCents },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Sale",
          entityId: sale.id,
          action: "SALE_UPDATED",
          before,
          after: { amountCents: sale.amountCents },
        },
      });
      // If this is the first time a value became known, this actually sends
      // the Purchase; if the sale was already sent, ConversionEventsService's
      // dedup on (leadId, type) makes this a no-op — a corrected value is
      // never re-sent to Meta (Section: known limitation, docs/META_CAPI.md).
      await this.conversionEvents.recordPurchase(organizationId, id, now, dto.revenueCents);
    }

    if (data.status) {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Lead",
          entityId: id,
          action: "LEAD_STATUS_CHANGED",
          before: { status: beforeStatus },
          after: { status: data.status },
        },
      });

      // O mesmo aviso que a mudança automática produz. Para quem está com o
      // quadro aberto do outro lado, um cartão movido pelo colega e um movido
      // por uma regra são o mesmo fato: o lead andou.
      const anuncio = ANUNCIO_POR_ESTAGIO[data.status as "QUALIFIED" | "MEETING_SCHEDULED" | "WON"];
      const nome = lead.name ?? lead.rawPhone;
      await this.notifications.notificar({
        type: anuncio.tipo,
        organizationId,
        leadId: id,
        leadName: nome,
        phone: lead.rawPhone,
        stage: data.status as string,
        title: `${anuncio.titulo}: ${nome}`,
        timestamp: now.toISOString(),
      });
    }

    return this.findOne(organizationId, id);
  }

  /**
   * Envia uma mensagem para o lead pelo WhatsApp (Fase 8).
   *
   * A mensagem é persistida como OUTBOUND/PENDING *antes* de ser enfileirada,
   * nunca depois: assim ela aparece na conversa imediatamente e, se o envio
   * falhar, existe uma linha concreta para marcar como FAILED e mostrar o
   * motivo — em vez de a mensagem simplesmente sumir.
   */
  async sendMessage(organizationId: string, leadId: string, dto: SendMessageDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    if (!lead) {
      throw new AppException("NOT_FOUND", "Lead não encontrado.", HttpStatus.NOT_FOUND);
    }

    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } });
    if (!connection || connection.status !== "CONNECTED") {
      throw new AppException(
        "NOT_CONNECTED",
        "Conecte um número de WhatsApp antes de enviar mensagens.",
        HttpStatus.BAD_REQUEST,
      );
    }

    // A conversa já existe sempre que o lead mandou ao menos uma mensagem —
    // que é a única forma de um lead nascer neste produto.
    const conversation = await this.prisma.conversation.findFirst({
      where: { leadId, whatsappConnectionId: connection.id },
    });
    if (!conversation) {
      throw new AppException(
        "NO_CONVERSATION",
        "Ainda não há uma conversa com este lead neste número.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        type: "TEXT",
        text: dto.text,
        timestamp: now,
        outboundStatus: "PENDING",
        // externalId fica null até o provider aceitar e devolver o id real.
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });

    await this.sendQueue.add(
      "send",
      { messageId: message.id },
      {
        jobId: message.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    return message;
  }

  private assertForwardTransition(current: LeadStatus, target: LeadStatus): void {
    if (STATUS_ORDER[target] <= STATUS_ORDER[current]) {
      throw new AppException(
        "INVALID_STATUS_TRANSITION",
        `Não é possível mudar o status de ${current} para ${target}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
