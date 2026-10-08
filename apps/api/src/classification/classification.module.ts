import { SalesModule } from "../sales/sales.module";
import { Module } from "@nestjs/common";
import { ConversionEventsModule } from "../integrations/meta/conversion-events.module";
import { ClassificationRulesController } from "./classification-rules.controller";
import { ClassificationRulesService } from "./classification-rules.service";
import { ConversationClassifierService } from "./conversation-classifier.service";

@Module({
  imports: [ConversionEventsModule, SalesModule],
  controllers: [ClassificationRulesController],
  providers: [ClassificationRulesService, ConversationClassifierService],
  exports: [ConversationClassifierService],
})
export class ClassificationModule {}
