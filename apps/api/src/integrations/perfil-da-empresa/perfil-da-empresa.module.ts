import { Module } from "@nestjs/common";
import { QueueModule } from "../../common/queue/queue.module";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { GoogleDoPerfilModule } from "./google-do-perfil.module";
import { PerfilDaEmpresaController } from "./perfil-da-empresa.controller";
import { PerfilDaEmpresaService } from "./perfil-da-empresa.service";

@Module({
  imports: [QueueModule, GoogleDoPerfilModule],
  controllers: [PerfilDaEmpresaController],
  providers: [PerfilDaEmpresaService, PlatformAdminGuard],
})
export class PerfilDaEmpresaModule {}
