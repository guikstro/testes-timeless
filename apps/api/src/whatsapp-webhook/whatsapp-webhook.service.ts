import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { WHATSAPP_EVENTS_QUEUE } from "../common/queue/queue.constants";
import { WhatsAppInboundMessageJob } from "../common/queue/whatsapp-event.job";
import { WhatsAppConnectionsService } from "../integrations/whatsapp/whatsapp-connections.service";
import { MotorWhatsApp } from "../integrations/whatsapp/motor-whatsapp";
import { LinkDeConexaoService } from "../integrations/whatsapp/link-de-conexao.service";
import { RecuperaHistoricoService } from "../integrations/whatsapp/recupera-historico.service";
import { parseWebhookPayload } from "./parse-webhook-payload";
import { parseEvolutionPayload } from "./parse-evolution-payload";
import { verifyWhatsAppSignature } from "./verify-signature";

@Injectable()
export class WhatsAppWebhookService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    @InjectQueue(WHATSAPP_EVENTS_QUEUE) private readonly queue: Queue<WhatsAppInboundMessageJob>,
    private readonly connections: WhatsAppConnectionsService,
    private readonly motor: MotorWhatsApp,
    private readonly links: LinkDeConexaoService,
    private readonly historico: RecuperaHistoricoService,
  ) {}

  /** O WhatsApp por QR Code entrega seus eventos aqui, sem passar por HTTP. */
  onModuleInit(): void {
    this.motor.aoEvento((evento) => this.enqueueEvolutionEvent(evento));
  }

  verifyHandshake(mode: string | undefined, token: string | undefined): boolean {
    return mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  }

  verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      this.logger.warn("WHATSAPP_APP_SECRET is not set — rejecting webhook (cannot verify authenticity)");
      return false;
    }
    return verifyWhatsAppSignature(rawBody, signatureHeader, appSecret);
  }

  /** Enqueues one job per inbound message and returns immediately — never do DB work on this path (Section 32/54). */
  async enqueueEvents(payload: unknown): Promise<number> {
    const jobs = parseWebhookPayload(payload);

    for (const job of jobs) {
      await this.enqueue(job);
    }

    return jobs.length;
  }

  /**
   * Eventos do WhatsApp por QR Code (motor embutido), um por vez. Mudanças de conexão não viram job: elas
   * atualizam o status da conexão direto, que é justamente o que faz o
   * "conectado" aparecer na tela sem o usuário recarregar a página.
   */
  async enqueueEvolutionEvent(payload: unknown): Promise<number> {
    const parsed = parseEvolutionPayload(payload);
    if (!parsed) {
      this.logarDescarte(payload);
      return 0;
    }

    if (parsed.kind === "connection") {
      const conectou = await this.connections.syncEvolutionState(parsed.instanceName, parsed.state);
      // O link de conexão é de uso único: conectou, deixa de valer, mesmo com
      // a página já fechada. Senão, numa queda, quem tivesse o link poria
      // outro celular na conta.
      if (conectou) await this.links.marcaConectado(conectou);
      // Solto de propósito: são minutos de pedidos ao celular, e o evento de
      // conexão não pode esperar por eles.
      if (conectou) void this.historico.recupera(parsed.instanceName);
      return 0;
    }

    await this.enqueue(parsed.job);
    return 1;
  }

  /**
   * Uma mensagem que o parser não aceitou deixa rastro, sem telefone nem texto:
   * só o tipo do endereço e se era nossa. É o que permite descobrir de onde
   * vem uma conversa com buracos.
   */
  private logarDescarte(payload: unknown): void {
    const corpo = payload as { event?: string; data?: { key?: { remoteJid?: string; fromMe?: boolean }; message?: Record<string, unknown> } };
    if (corpo?.event !== "messages.upsert") return;
    const jid = corpo.data?.key?.remoteJid ?? "";
    this.logger.log(
      JSON.stringify({
        event: "mensagem_descartada",
        fromMe: corpo.data?.key?.fromMe === true,
        endereco: jid.split("@")[1] ?? "sem-endereco",
        conteudo: Object.keys(corpo.data?.message ?? {}).slice(0, 3),
      }),
    );
  }

  private async enqueue(job: WhatsAppInboundMessageJob): Promise<void> {
    await this.queue.add("inbound-message", job, {
      // Both providers retry webhook deliveries; the job id makes a duplicate
      // delivery a duplicate *enqueue*, not a duplicate job — BullMQ
      // silently no-ops adding a job with an id already present.
      jobId: job.messageId,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
