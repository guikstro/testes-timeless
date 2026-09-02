import { Module } from "@nestjs/common";
import { GoogleConversionsController } from "./google-conversions.controller";
import { GoogleConversionsService } from "./google-conversions.service";

@Module({
  controllers: [GoogleConversionsController],
  providers: [GoogleConversionsService],
})
export class GoogleConversionsModule {}
