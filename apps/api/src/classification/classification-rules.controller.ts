import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { ClassificationRulesService } from "./classification-rules.service";
import { CreateClassificationRuleDto } from "./dto/create-classification-rule.dto";

@Controller("classification-rules")
@UseGuards(JwtAuthGuard)
export class ClassificationRulesController {
  constructor(private readonly classificationRulesService: ClassificationRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.classificationRulesService.list(user.organizationId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClassificationRuleDto) {
    return this.classificationRulesService.create(user.organizationId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.classificationRulesService.remove(user.organizationId, id);
  }
}
