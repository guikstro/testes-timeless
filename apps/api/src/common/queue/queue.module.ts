import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { getRedisConnectionOptions } from "./redis-connection";
import { META_SYNC_QUEUE, WHATSAPP_EVENTS_QUEUE } from "./queue.constants";

/**
 * Producer-side registration: import this wherever a job needs to be
 * *enqueued* (the API). The worker process registers the same queue names
 * separately in worker.module.ts alongside their @Processor classes.
 */
@Module({
  imports: [
    BullModule.forRoot({ connection: getRedisConnectionOptions() }),
    BullModule.registerQueue({ name: WHATSAPP_EVENTS_QUEUE }, { name: META_SYNC_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
