import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { WHATSAPP_EVENTS_QUEUE } from "../../common/queue/queue.constants";
import { WhatsAppInboundMessageJob } from "../../common/queue/whatsapp-event.job";
import { WhatsAppIngestionService } from "./whatsapp-ingestion.service";

@Processor(WHATSAPP_EVENTS_QUEUE)
export class WhatsAppEventProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppEventProcessor.name);

  constructor(private readonly ingestionService: WhatsAppIngestionService) {
    super();
  }

  async process(job: Job<WhatsAppInboundMessageJob>): Promise<void> {
    try {
      await this.ingestionService.ingest(job.data);
    } catch (error) {
      this.logger.error(
        JSON.stringify({ event: "whatsapp_event_processing_failed", jobId: job.id, error: (error as Error).message }),
      );
      throw error; // let BullMQ retry per the job's configured attempts/backoff
    }
  }
}
