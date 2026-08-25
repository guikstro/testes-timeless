import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { getRedisConnectionOptions } from "./redis-connection";
import { WHATSAPP_EVENTS_QUEUE } from "./queue.constants";

/**
 * Producer-side registration: import this wherever a job needs to be
 * *enqueued* (the API). The worker process registers the same queue name
 * separately in worker.module.ts alongside its @Processor.
 */
@Module({
  imports: [
    BullModule.forRoot({ connection: getRedisConnectionOptions() }),
    BullModule.registerQueue({ name: WHATSAPP_EVENTS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
