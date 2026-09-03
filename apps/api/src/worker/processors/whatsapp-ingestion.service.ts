import { Injectable, Logger } from "@nestjs/common";
import { LeadStatus, Message } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { normalizePhone } from "../../common/utils/normalize-phone";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { WhatsAppInboundMessageJob } from "../../common/queue/whatsapp-event.job";
import { AttributionEngine, AttributionResult } from "../../attribution/attribution-engine";
import { ConversationClassifierService } from "../../classification/conversation-classifier.service";
import { ConversionEventsService } from "../../integrations/meta/conversion-events.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { ANUNCIO_POR_ESTAGIO } from "../../notifications/notification-event";


/** Quanto de uma mensagem cabe num aviso sem virar parede de texto. */
const LIMITE_DA_PREVIA = 140;

function recorta(texto: string | undefined): string | undefined {
  if (!texto) return undefined;
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length === 0) return undefined;
  return limpo.length > LIMITE_DA_PREVIA ? `${limpo.slice(0, LIMITE_DA_PREVIA - 1)}…` : limpo;
}


/** A linha de origem, montada num lugar só: ela nasce em dois caminhos. */
function dadosDaOrigem(organizationId: string, leadId: string, origem: AttributionResult) {
  return {
    organizationId,
    leadId,
    method: origem.method,
    confidence: origem.confidence,
    trackingClickId: origem.trackingClickId,
    evidence: origem.evidence,
  };
}


@Injectable()
export class WhatsAppIngestionService {
  private readonly logger = new Logger(WhatsAppIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attributionEngine: AttributionEngine,
    private readonly classifier: ConversationClassifierService,
    private readonly conversionEvents: ConversionEventsService,
    private readonly notifications: NotificationsService,
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

    const { lead, wasCreated: leadWasCreated, semOrigem } = await this.findOrCreateLead(
      organizationId,
      normalizedPhone,
      job.waId,
      job.profileName,
      occurredAt,
      job,
    );

    if (leadWasCreated) {
      // A origem já foi gravada junto do lead, na mesma transação. Aqui fica
      // só o que não cabe numa transação: enfileirar o evento para a Meta.
      await this.conversionEvents.recordLead(organizationId, lead.id, occurredAt);
    } else if (semOrigem) {
      // Rede de segurança. Um lead sem linha de origem é um primeiro toque
      // que não terminou: ou foi criado antes desta correção, ou escapou da
      // transação por algum caminho que não previmos. A origem sai desta
      // mensagem, que é pior que a primeira e muito melhor que nenhuma.
      await this.completarPrimeiroToque(organizationId, lead.id, job, occurredAt);
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

    // O aviso sai por último, com tudo já gravado. Ao contrário, a tela
    // poderia receber o evento e ir buscar um lead que ainda não existe.
    await this.avisar(organizationId, lead, leadWasCreated, job, occurredAt);
  }

  /**
   * Traduz o que acabou de acontecer em avisos para quem está com a tela
   * aberta.
   *
   * O estágio depois do classificador é relido do banco em vez de deduzido
   * aqui. Espelhar as regras dele nesta função criaria duas cópias da mesma
   * lógica, e a segunda envelheceria calada: um caminho novo lá dentro
   * simplesmente deixaria de ser anunciado, sem nada quebrar.
   */
  private async avisar(
    organizationId: string,
    leadAntes: { id: string; name: string | null; rawPhone: string; status: LeadStatus },
    leadWasCreated: boolean,
    job: WhatsAppInboundMessageJob,
    occurredAt: Date,
  ): Promise<void> {
    const nome = leadAntes.name ?? leadAntes.rawPhone;
    const previa = job.type === "text" ? recorta(job.text) : undefined;
    const comum = {
      organizationId,
      leadId: leadAntes.id,
      leadName: nome,
      phone: leadAntes.rawPhone,
      message: previa,
      timestamp: occurredAt.toISOString(),
    };

    // Lead novo recebe um aviso só: anunciar a criação e a primeira mensagem
    // separadamente encheria a tela com dois cartões sobre o mesmo fato.
    await this.notifications.notificar(
      leadWasCreated
        ? { ...comum, type: "lead.created", title: `Novo lead: ${nome}`, body: previa }
        : { ...comum, type: "message.received", title: `${nome} respondeu`, body: previa },
    );

    const depois = await this.prisma.lead.findUnique({
      where: { id: leadAntes.id },
      select: { status: true },
    });
    // `NEW` está fora porque o funil não anda para trás: se o estágio mudou e
    // ainda é NEW, alguma coisa está errada, e inventar um aviso seria pior
    // que ficar calado.
    if (!depois || depois.status === leadAntes.status || depois.status === "NEW") return;

    const anuncio = ANUNCIO_POR_ESTAGIO[depois.status];
    await this.notifications.notificar({
      ...comum,
      type: anuncio.tipo,
      stage: depois.status,
      title: `${anuncio.titulo}: ${nome}`,
      body: previa,
    });
  }

  /**
   * Termina um primeiro toque que ficou pela metade.
   *
   * Só roda para um lead que já existe e não tem origem gravada. O evento de
   * criação não é refeito aqui: ele pertence ao instante em que o lead
   * nasceu, e inventar um agora contaria uma história errada na linha do
   * tempo.
   */
  private async completarPrimeiroToque(
    organizationId: string,
    leadId: string,
    job: WhatsAppInboundMessageJob,
    occurredAt: Date,
  ): Promise<void> {
    const origem = await this.attributionEngine.resolve({
      organizationId,
      messageText: job.text,
      referral: job.referral,
    });

    try {
      await this.prisma.attribution.create({ data: dadosDaOrigem(organizationId, leadId, origem) });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Outra entrega terminou o serviço primeiro. Uma atribuição de primeiro
      // toque nunca é sobrescrita (Section 31), então aqui não há mais nada
      // a fazer, nem o evento para a Meta, que é dela.
      return;
    }

    await this.conversionEvents.recordLead(organizationId, leadId, occurredAt);
  }

  /**
   * O lead e o seu primeiro toque, indivisíveis.
   *
   * Criar o lead, registrar a criação e gravar a origem acontecem na mesma
   * transação de propósito. Antes eram três escritas soltas atrás de um
   * `if (acabei de criar o lead)`, e isso tinha uma consequência que não
   * aparecia em lugar nenhum: se o processo morresse entre a primeira e a
   * terceira, a retentativa do BullMQ encontrava o lead já criado, concluía
   * que não havia primeiro toque a fazer, e o lead ficava sem origem para
   * sempre. Sem erro, sem log, e a origem é o produto inteiro.
   *
   * `semOrigem` acompanha o lead existente pelo mesmo motivo: é a marca de um
   * primeiro toque que não terminou, e vem no mesmo `include` para não custar
   * uma segunda consulta por mensagem.
   */
  private async findOrCreateLead(
    organizationId: string,
    normalizedPhone: string,
    rawPhone: string,
    profileName: string | undefined,
    occurredAt: Date,
    job: WhatsAppInboundMessageJob,
  ) {
    const chave = { organizationId_normalizedPhone: { organizationId, normalizedPhone } };
    // Só a presença da linha, nunca o conteúdo: o que interessa aqui é se o
    // primeiro toque terminou, não qual foi a origem.
    const comOrigem = { attribution: { select: { id: true } } } as const;

    const existing = await this.prisma.lead.findUnique({ where: chave, include: comOrigem });

    if (existing) {
      const updated = await this.prisma.lead.update({
        where: { id: existing.id },
        data: {
          lastContactAt: occurredAt > existing.lastContactAt ? occurredAt : existing.lastContactAt,
          ...(profileName && !existing.name ? { name: profileName } : {}),
        },
      });
      return { lead: updated, wasCreated: false, semOrigem: !existing.attribution };
    }

    // Resolvida antes de abrir a transação: é leitura, e uma transação
    // interativa esperando consulta prende uma conexão do pool à toa.
    const origem = await this.attributionEngine.resolve({
      organizationId,
      messageText: job.text,
      referral: job.referral,
    });

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            organizationId,
            normalizedPhone,
            rawPhone,
            name: profileName,
            firstContactAt: occurredAt,
            lastContactAt: occurredAt,
          },
        });

        await tx.leadEvent.create({
          data: { organizationId, leadId: lead.id, type: "LEAD_CREATED", occurredAt },
        });

        // Primeiro toque, calculado uma vez só a partir da evidência desta
        // mensagem e nunca revisto depois (Section 31) — ver AttributionEngine.
        await tx.attribution.create({ data: dadosDaOrigem(organizationId, lead.id, origem) });

        return lead;
      });

      return { lead: created, wasCreated: true, semOrigem: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Lost the race to another concurrent event for the same phone number.
      // Quem ganhou gravou a origem na própria transação, então aqui não há
      // primeiro toque pendente.
      const lead = await this.prisma.lead.findUniqueOrThrow({ where: chave, include: comOrigem });
      return { lead, wasCreated: false, semOrigem: !lead.attribution };
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
    } catch (error) {
      // Perdeu a corrida para outra primeira mensagem do mesmo lead. Quem
      // garante que isto é uma corrida, e não um defeito nosso engolido, é a
      // restrição única no banco: antes dela o `catch` era cego e a criação
      // simplesmente não falhava, então nasciam duas conversas.
      if (!isUniqueConstraintError(error)) throw error;
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
