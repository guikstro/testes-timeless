import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MfaModule } from "../auth/mfa/mfa.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { ArmazenamentoService } from "./upload/armazenamento.service";
import { UploadsController } from "./upload/uploads.controller";

@Module({
  imports: [AuthModule, MfaModule],
  controllers: [OrganizationsController, UploadsController],
  providers: [OrganizationsService, ArmazenamentoService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
