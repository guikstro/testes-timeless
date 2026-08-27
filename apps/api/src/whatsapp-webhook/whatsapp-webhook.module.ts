import { Module } from "@nestjs/common";
import { QueueModule } from "../common/queue/queue.module";
import { WhatsAppConnectionsModule } from "../integrations/whatsapp/whatsapp-connections.module";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [QueueModule, WhatsAppConnectionsModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppWebhookService],
})
export class WhatsAppWebhookModule {}
