import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { WHATSAPP_SEND_QUEUE } from "../../common/queue/queue.constants";
import { WhatsAppSendJob } from "../../common/queue/whatsapp-send.job";
import { WhatsAppSendService } from "./whatsapp-send.service";

@Processor(WHATSAPP_SEND_QUEUE)
export class WhatsAppSendProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppSendProcessor.name);

  constructor(private readonly sendService: WhatsAppSendService) {
    super();
  }

  async process(job: Job<WhatsAppSendJob>): Promise<void> {
    const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
    // `attemptsMade` conta apenas tentativas concluídas ANTES desta chamada
    // (0 na primeira) — verificado no código-fonte do BullMQ na Fase 7, onde
    // a fórmula invertida deixava eventos presos em "tentando novamente".
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

    try {
      await this.sendService.send(job.data.messageId, isLastAttempt);
    } catch (error) {
      this.logger.error(
        JSON.stringify({ event: "whatsapp_send_job_failed", jobId: job.id, error: (error as Error).message }),
      );
      throw error;
    }
  }
}
