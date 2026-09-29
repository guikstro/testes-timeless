import { Module } from "@nestjs/common";
import { PresencaLocalController } from "./presenca-local.controller";
import { PresencaLocalService } from "./presenca-local.service";

@Module({
  controllers: [PresencaLocalController],
  providers: [PresencaLocalService],
})
export class PresencaLocalModule {}
