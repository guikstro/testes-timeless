import { Module } from "@nestjs/common";
import { ClassificationRulesController } from "./classification-rules.controller";
import { ClassificationRulesService } from "./classification-rules.service";
import { ConversationClassifierService } from "./conversation-classifier.service";

@Module({
  controllers: [ClassificationRulesController],
  providers: [ClassificationRulesService, ConversationClassifierService],
  exports: [ConversationClassifierService],
})
export class ClassificationModule {}
