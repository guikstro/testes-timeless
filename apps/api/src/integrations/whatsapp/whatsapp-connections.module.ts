import { Module } from "@nestjs/common";
import { WhatsAppConnectionsController } from "./whatsapp-connections.controller";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { MotorWhatsApp } from "./motor-whatsapp";
import { LinkDeConexaoService } from "./link-de-conexao.service";
import { LinkPublicoController } from "./link-publico.controller";

/**
 * Exporta o motor para existir uma cópia só no processo: o envio (fila) e
 * a entrada de eventos (`WhatsAppWebhookModule`) usam a mesma conexão.
 */
@Module({
  controllers: [WhatsAppConnectionsController, LinkPublicoController],
  providers: [WhatsAppConnectionsService, MotorWhatsApp, LinkDeConexaoService],
  exports: [WhatsAppConnectionsService, MotorWhatsApp, LinkDeConexaoService],
})
export class WhatsAppConnectionsModule {}
