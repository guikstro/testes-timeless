import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { META_SYNC_QUEUE } from "../../common/queue/queue.constants";
import { MetaSyncJob } from "../../common/queue/meta-sync.job";
import { MetaSyncService } from "./meta-sync.service";

@Processor(META_SYNC_QUEUE)
export class MetaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(private readonly metaSyncService: MetaSyncService) {
    super();
  }

  async process(job: Job<MetaSyncJob>): Promise<void> {
    try {
      await this.metaSyncService.sync(job.data.organizationId);
    } catch (error) {
      this.logger.error(
        JSON.stringify({ event: "meta_sync_failed", jobId: job.id, error: (error as Error).message }),
      );
      throw error;
    }
  }
}
