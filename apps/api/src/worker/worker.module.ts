import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "../common/prisma/prisma.module";
import { EncryptionModule } from "../common/encryption/encryption.module";
import { getRedisConnectionOptions } from "../common/queue/redis-connection";
import { META_SYNC_QUEUE, WHATSAPP_EVENTS_QUEUE } from "../common/queue/queue.constants";
import { AttributionModule } from "../attribution/attribution.module";
import { ClassificationModule } from "../classification/classification.module";
import { WhatsAppEventProcessor } from "./processors/whatsapp-event.processor";
import { WhatsAppIngestionService } from "./processors/whatsapp-ingestion.service";
import { MetaSyncProcessor } from "./processors/meta-sync.processor";
import { MetaSyncService } from "./processors/meta-sync.service";
import { MetaGraphClient } from "../integrations/meta/meta-graph-client";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EncryptionModule,
    AttributionModule,
    ClassificationModule,
    BullModule.forRoot({ connection: getRedisConnectionOptions() }),
    BullModule.registerQueue({ name: WHATSAPP_EVENTS_QUEUE }, { name: META_SYNC_QUEUE }),
  ],
  providers: [
    WhatsAppEventProcessor,
    WhatsAppIngestionService,
    MetaSyncProcessor,
    MetaSyncService,
    MetaGraphClient,
  ],
})
export class WorkerModule {}
