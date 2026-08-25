import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { META_CONVERSIONS_QUEUE } from "../../common/queue/queue.constants";
import { MetaConversionSendJob } from "../../common/queue/meta-conversion-send.job";
import { MetaConversionSendService } from "./meta-conversion-send.service";

@Processor(META_CONVERSIONS_QUEUE)
export class MetaConversionSendProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaConversionSendProcessor.name);

  constructor(private readonly metaConversionSendService: MetaConversionSendService) {
    super();
  }

  async process(job: Job<MetaConversionSendJob>): Promise<void> {
    const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
    // Verified against BullMQ's own source (job.js `shouldRetryJob`, which
    // decides whether to retry via `this.attemptsMade + 1 < opts.attempts`):
    // `job.attemptsMade` counts only attempts completed *before* this call —
    // it is still 0 during the very first invocation, not 1. This is the
    // last attempt exactly when this call's own ordinal (attemptsMade + 1)
    // reaches the configured max.
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

    try {
      await this.metaConversionSendService.send(job.data.conversionEventId, isLastAttempt);
    } catch (error) {
      this.logger.error(
        JSON.stringify({ event: "meta_conversion_send_failed", jobId: job.id, error: (error as Error).message }),
      );
      throw error;
    }
  }
}
