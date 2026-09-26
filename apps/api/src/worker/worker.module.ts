import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "../common/prisma/prisma.module";
import { EncryptionModule } from "../common/encryption/encryption.module";
import { EmailModule } from "../common/email/email.module";
import { QueueModule } from "../common/queue/queue.module";
import {
  META_CONVERSIONS_QUEUE,
  MANUTENCAO_QUEUE,
  EMAIL_QUEUE,
  META_SYNC_QUEUE,
  WHATSAPP_EVENTS_QUEUE,
  WHATSAPP_SEND_QUEUE,
} from "../common/queue/queue.constants";
import { AgendaDeSincronia } from "./agenda-de-sincronia";
import { EmailProcessor } from "./processors/email.processor";
import { AgendaDeFaxina } from "./manutencao/agenda-de-faxina";
import { FaxinaProcessor } from "./manutencao/faxina.processor";
import { FaxinaService } from "./manutencao/faxina.service";
import { AttributionModule } from "../attribution/attribution.module";
import { ClassificationModule } from "../classification/classification.module";
import { ConversionEventsModule } from "../integrations/meta/conversion-events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { WhatsAppEventProcessor } from "./processors/whatsapp-event.processor";
import { WhatsAppIngestionService } from "./processors/whatsapp-ingestion.service";
import { MetaSyncProcessor } from "./processors/meta-sync.processor";
import { MetaSyncService } from "./processors/meta-sync.service";
import { MetaConversionSendProcessor } from "./processors/meta-conversion-send.processor";
import { MetaConversionSendService } from "./processors/meta-conversion-send.service";
import { WhatsAppSendProcessor } from "./processors/whatsapp-send.processor";
import { WhatsAppSendService } from "./processors/whatsapp-send.service";
import { MetaGraphClient } from "../integrations/meta/meta-graph-client";
import { WhatsAppConnectionsModule } from "../integrations/whatsapp/whatsapp-connections.module";

/**
 * Processadores das filas e agendas, rodando dentro do processo da API.
 * Um processo só: o WhatsApp por QR Code mantém a conexão em memória, e um
 * worker separado abriria uma segunda conexão para o mesmo número.
 */
@Module({
  imports: [
    PrismaModule,
    EncryptionModule,
    EmailModule,
    AttributionModule,
    ClassificationModule,
    ConversionEventsModule,
    NotificationsModule,
    QueueModule,
    WhatsAppConnectionsModule,
    BullModule.registerQueue(
      { name: WHATSAPP_EVENTS_QUEUE },
      { name: WHATSAPP_SEND_QUEUE },
      { name: META_SYNC_QUEUE },
      { name: META_CONVERSIONS_QUEUE },
      { name: MANUTENCAO_QUEUE },
      { name: EMAIL_QUEUE },
    ),
  ],
  providers: [
    AgendaDeSincronia,
    AgendaDeFaxina,
    FaxinaProcessor,
    FaxinaService,
    EmailProcessor,
    WhatsAppEventProcessor,
    WhatsAppIngestionService,
    WhatsAppSendProcessor,
    WhatsAppSendService,
    MetaSyncProcessor,
    MetaSyncService,
    MetaConversionSendProcessor,
    MetaConversionSendService,
    MetaGraphClient,
  ],
})
export class WorkerModule {}
