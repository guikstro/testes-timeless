import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { META_CONVERSIONS_QUEUE } from "../../common/queue/queue.constants";
import { ConversionEventsService } from "./conversion-events.service";

/**
 * Deliberately registers only this one queue (no `BullModule.forRoot` here)
 * so it can be imported from both the API's module graph (where
 * QueueModule already called `forRoot`) and the worker's (which calls
 * `forRoot` itself in worker.module.ts) without registering the shared Redis
 * connection twice in either process.
 */
@Module({
  imports: [BullModule.registerQueue({ name: META_CONVERSIONS_QUEUE })],
  providers: [ConversionEventsService],
  exports: [ConversionEventsService],
})
export class ConversionEventsModule {}
