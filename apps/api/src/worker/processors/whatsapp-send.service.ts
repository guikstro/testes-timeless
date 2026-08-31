import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EvolutionClient } from "../../integrations/whatsapp/evolution-client";
import { ConversationClassifierService } from "../../classification/conversation-classifier.service";

/**
 * Entrega uma mensagem OUTBOUND já persistida ao provider. Relê o estado
 * atual do banco a cada tentativa em vez de confiar no que valia quando o
 * job foi enfileirado — a mesma lição que as Fases 6 e 7 aprenderam com
 * jobs atrasados sobrevivendo a uma desconexão. Ver docs/WHATSAPP.md.
 */
@Injectable()
export class WhatsAppSendService {
  private readonly logger = new Logger(WhatsAppSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionClient,
    private readonly classifier: ConversationClassifierService,
  ) {}

  async send(messageId: string, isLastAttempt: boolean): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { lead: true, whatsappConnection: true } } },
    });

    if (!message || message.direction !== "OUTBOUND") return;
    if (message.outboundStatus === "SENT") {
      // Uma tentativa anterior já foi aceita pelo provider — reenviar
      // duplicaria a mensagem no celular do lead.
      return;
    }

    const connection = message.conversation.whatsappConnection;

    if (connection.status !== "CONNECTED") {
      await this.fail(messageId, "O WhatsApp não está conectado — reconecte para enviar mensagens.");
      return;
    }

    if (connection.provider !== "EVOLUTION" || !connection.instanceName) {
      // A Cloud API precisa de um template aprovado fora da janela de 24h e
      // de um access token válido; enviar por ela é uma fase futura. Falhar
      // explicitamente é melhor que fingir que a mensagem saiu.
      await this.fail(messageId, "Envio de mensagens só está disponível para conexões por QR Code.");
      return;
    }

    if (!message.text?.trim()) {
      await this.fail(messageId, "Mensagem vazia.");
      return;
    }

    // Dígitos sem "+" é o formato que a Evolution espera.
    const toPhoneDigits = message.conversation.lead.normalizedPhone.replace(/^\+/, "");

    try {
      const result = await this.evolution.sendText(connection.instanceName, toPhoneDigits, message.text);
      await this.prisma.message.update({
        where: { id: messageId },
        data: { outboundStatus: "SENT", externalId: result.externalId, sendError: null },
      });

      // Classificar aqui, e não ao criar a mensagem, é o que garante que uma
      // reunião só é marcada por uma frase que o lead realmente recebeu: uma
      // mensagem que falhou no envio não combinou horário com ninguém.
      //
      // Só o alvo "reunião" reage a uma mensagem nossa — o classificador
      // recusa venda e qualificação vindas de OUTBOUND.
      await this.classifier.classify({
        organizationId: message.conversation.lead.organizationId,
        lead: message.conversation.lead,
        messageId: message.id,
        messageText: message.text ?? undefined,
        occurredAt: message.timestamp,
        direction: "OUTBOUND",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro desconhecido ao enviar.";
      if (isLastAttempt) {
        await this.fail(messageId, reason);
      } else {
        await this.prisma.message.update({ where: { id: messageId }, data: { sendError: reason } });
      }
      this.logger.error(JSON.stringify({ event: "whatsapp_send_failed", messageId, reason }));
      throw error; // deixa o BullMQ aplicar o retry/backoff configurado
    }
  }

  private async fail(messageId: string, reason: string): Promise<void> {
    await this.prisma.message.update({
      where: { id: messageId },
      data: { outboundStatus: "FAILED", sendError: reason },
    });
  }
}
