import { Module } from "@nestjs/common";
import { WhatsAppConnectionsController } from "./whatsapp-connections.controller";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";

@Module({
  controllers: [WhatsAppConnectionsController],
  providers: [WhatsAppConnectionsService],
})
export class WhatsAppConnectionsModule {}
