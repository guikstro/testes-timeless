import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { ArmazenamentoService } from "./upload/armazenamento.service";
import { UploadsController } from "./upload/uploads.controller";

@Module({
  controllers: [OrganizationsController, UploadsController],
  providers: [OrganizationsService, ArmazenamentoService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
