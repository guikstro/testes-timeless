import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { EntregaDeSessaoService } from "./entrega/entrega-de-sessao.service";
import { WhatsAppConnectionsModule } from "../integrations/whatsapp/whatsapp-connections.module";

/** Importa AuthModule para reemitir tokens ao entrar numa organização. */
@Module({
  imports: [forwardRef(() => AuthModule), WhatsAppConnectionsModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard, EntregaDeSessaoService],
  exports: [EntregaDeSessaoService],
})
export class AdminModule {}
