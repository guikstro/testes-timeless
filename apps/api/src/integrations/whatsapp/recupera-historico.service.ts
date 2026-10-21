import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MotorWhatsApp } from "./motor-whatsapp";
import { JANELA_DO_HISTORICO_MS } from "./evento-do-motor";

/** Quantas mensagens anteriores pedir por conversa. */
const POR_CONVERSA = 50;
/** Teto de conversas por recuperação, para não sobrecarregar o celular. */
const MAXIMO_DE_CONVERSAS = 300;
/** Intervalo entre pedidos: o celular responde um de cada vez. */
const INTERVALO_MS = 2500;

/**
 * Recupera as respostas dadas no celular antes de o sistema saber guardá-las.
 *
 * Para cada conversa recente que ainda não foi recuperada, pede ao celular as
 * mensagens anteriores à última que o lead mandou. O que volta entra pela
 * ingestão como histórico: completa a conversa, sem criar lead e sem avisos,
 * e a mensagem que o sistema já conhece é ignorada.
 *
 * Roda quando a conexão abre. Cada conversa é pedida uma vez só.
 */
@Injectable()
export class RecuperaHistoricoService {
  private readonly logger = new Logger(RecuperaHistoricoService.name);
  private readonly emAndamento = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorWhatsApp,
  ) {}

  /** Nunca lança: roda solto, depois de a conexão abrir. */
  async recupera(instanceName: string, esperar: (ms: number) => Promise<void> = dorme): Promise<number> {
    if (this.emAndamento.has(instanceName)) return 0;
    this.emAndamento.add(instanceName);
    let pedidas = 0;
    try {
      const conexao = await this.prisma.whatsAppConnection.findUnique({ where: { instanceName } });
      if (!conexao) return 0;

      const conversas = await this.prisma.conversation.findMany({
        where: {
          whatsappConnectionId: conexao.id,
          historyRequestedAt: null,
          lastMessageAt: { gte: new Date(Date.now() - JANELA_DO_HISTORICO_MS) },
        },
        orderBy: { lastMessageAt: "desc" },
        take: MAXIMO_DE_CONVERSAS,
        select: { id: true, lead: { select: { normalizedPhone: true, whatsappLid: true } } },
      });

      // Uma espera curta antes do primeiro pedido: logo depois de conectar, o
      // celular ainda está mandando o que ficou na fila.
      if (conversas.length > 0) await esperar(INTERVALO_MS * 4);

      for (const conversa of conversas) {
        // A âncora é a última mensagem do lead que o sistema tem: o celular
        // devolve as anteriores a ela, e no meio delas estão as respostas.
        const ancora = await this.prisma.message.findFirst({
          where: { conversationId: conversa.id, direction: "INBOUND", externalId: { not: null } },
          orderBy: { timestamp: "desc" },
          select: { externalId: true, timestamp: true },
        });
        if (!ancora?.externalId) continue;

        const remoteJid = conversa.lead.whatsappLid
          ? `${conversa.lead.whatsappLid}@lid`
          : `${conversa.lead.normalizedPhone.replace(/^\+/, "")}@s.whatsapp.net`;

        const enviado = await this.motor.pedeHistorico(
          instanceName,
          { remoteJid, fromMe: false, id: ancora.externalId, timestampMs: ancora.timestamp.getTime() },
          POR_CONVERSA,
        );
        if (!enviado) break; // a conexão caiu: o resto fica para a próxima vez que abrir

        await this.prisma.conversation.update({ where: { id: conversa.id }, data: { historyRequestedAt: new Date() } });
        pedidas += 1;
        await esperar(INTERVALO_MS);
      }

      if (pedidas > 0) this.logger.log(JSON.stringify({ event: "historico_pedido", instanceName, conversas: pedidas }));
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "historico_nao_recuperado", instanceName, error: String(erro).slice(0, 200) }));
    } finally {
      this.emAndamento.delete(instanceName);
    }
    return pedidas;
  }
}

function dorme(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
