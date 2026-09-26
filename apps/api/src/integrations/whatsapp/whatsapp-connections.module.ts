import { Module } from "@nestjs/common";
import { WhatsAppConnectionsController } from "./whatsapp-connections.controller";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { MotorWhatsApp } from "./motor-whatsapp";

/**
 * Exporta o motor para existir uma cópia só no processo: o envio (fila) e
 * a entrada de eventos (`WhatsAppWebhookModule`) usam a mesma conexão.
 */
@Module({
  controllers: [WhatsAppConnectionsController],
  providers: [WhatsAppConnectionsService, MotorWhatsApp],
  exports: [WhatsAppConnectionsService, MotorWhatsApp],
})
export class WhatsAppConnectionsModule {}
