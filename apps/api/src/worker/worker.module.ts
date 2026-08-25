import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "../common/prisma/prisma.module";
import { getRedisConnectionOptions } from "../common/queue/redis-connection";
import { WHATSAPP_EVENTS_QUEUE } from "../common/queue/queue.constants";
import { WhatsAppEventProcessor } from "./processors/whatsapp-event.processor";
import { WhatsAppIngestionService } from "./processors/whatsapp-ingestion.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BullModule.forRoot({ connection: getRedisConnectionOptions() }),
    BullModule.registerQueue({ name: WHATSAPP_EVENTS_QUEUE }),
  ],
  providers: [WhatsAppEventProcessor, WhatsAppIngestionService],
})
export class WorkerModule {}
