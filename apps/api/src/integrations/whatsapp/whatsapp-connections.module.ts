import { Module } from "@nestjs/common";
import { WhatsAppConnectionsController } from "./whatsapp-connections.controller";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { EvolutionClient } from "./evolution-client";

/**
 * Exporta o serviço porque o receptor de webhooks da Evolution
 * (`WhatsAppWebhookModule`) precisa dele para refletir os eventos de
 * `CONNECTION_UPDATE` no status da conexão.
 */
@Module({
  controllers: [WhatsAppConnectionsController],
  providers: [WhatsAppConnectionsService, EvolutionClient],
  exports: [WhatsAppConnectionsService],
})
export class WhatsAppConnectionsModule {}
