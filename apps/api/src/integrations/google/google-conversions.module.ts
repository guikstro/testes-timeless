import { Module } from "@nestjs/common";
import { GoogleConversionsController } from "./google-conversions.controller";
import { GoogleConversionsService } from "./google-conversions.service";
import { EnvioDoGoogleAdsController, GoogleAdsScriptController } from "./script/google-ads-script.controller";
import { GoogleAdsScriptService } from "./script/google-ads-script.service";

@Module({
  controllers: [GoogleConversionsController, GoogleAdsScriptController, EnvioDoGoogleAdsController],
  providers: [GoogleConversionsService, GoogleAdsScriptService],
})
export class GoogleConversionsModule {}
