import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

/** Importa AuthModule para reemitir tokens ao entrar numa organização. */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard],
})
export class AdminModule {}
