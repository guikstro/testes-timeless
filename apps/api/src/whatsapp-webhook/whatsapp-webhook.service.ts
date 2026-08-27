import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { WHATSAPP_EVENTS_QUEUE } from "../common/queue/queue.constants";
import { WhatsAppInboundMessageJob } from "../common/queue/whatsapp-event.job";
import { WhatsAppConnectionsService } from "../integrations/whatsapp/whatsapp-connections.service";
import { parseWebhookPayload } from "./parse-webhook-payload";
import { parseEvolutionPayload } from "./parse-evolution-payload";
import { verifyWhatsAppSignature } from "./verify-signature";

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    @InjectQueue(WHATSAPP_EVENTS_QUEUE) private readonly queue: Queue<WhatsAppInboundMessageJob>,
    private readonly connections: WhatsAppConnectionsService,
  ) {}

  verifyHandshake(mode: string | undefined, token: string | undefined): boolean {
    return mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  }

  /**
   * Comparação em tempo constante para não vazar o segredo por timing — o
   * mesmo cuidado que o HMAC da Meta já tem em `verify-signature.ts`.
   */
  verifyEvolutionToken(token: string | undefined): boolean {
    const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (!expected) {
      this.logger.warn("EVOLUTION_WEBHOOK_TOKEN is not set — rejecting webhook (cannot verify authenticity)");
      return false;
    }
    if (!token || token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
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
   * Contraparte da Evolution API (Fase 8). Um evento por requisição (a
   * Evolution entrega assim), e mudanças de conexão não viram job: elas
   * atualizam o status da conexão direto, que é justamente o que faz o
   * "conectado" aparecer na tela sem o usuário recarregar a página.
   */
  async enqueueEvolutionEvent(payload: unknown): Promise<number> {
    const parsed = parseEvolutionPayload(payload);
    if (!parsed) return 0;

    if (parsed.kind === "connection") {
      await this.connections.syncEvolutionState(parsed.instanceName, parsed.state);
      return 0;
    }

    await this.enqueue(parsed.job);
    return 1;
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
