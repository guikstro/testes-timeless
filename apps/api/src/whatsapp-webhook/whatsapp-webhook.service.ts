import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { WHATSAPP_EVENTS_QUEUE } from "../common/queue/queue.constants";
import { WhatsAppInboundMessageJob } from "../common/queue/whatsapp-event.job";
import { parseWebhookPayload } from "./parse-webhook-payload";
import { verifyWhatsAppSignature } from "./verify-signature";

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(@InjectQueue(WHATSAPP_EVENTS_QUEUE) private readonly queue: Queue<WhatsAppInboundMessageJob>) {}

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
      await this.queue.add("inbound-message", job, {
        // Meta retries webhook deliveries; the job id makes a duplicate
        // delivery a duplicate *enqueue*, not a duplicate job — BullMQ
        // silently no-ops adding a job with an id already present.
        jobId: job.messageId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    }

    return jobs.length;
  }
}
