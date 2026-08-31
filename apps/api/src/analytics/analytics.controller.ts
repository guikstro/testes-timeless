import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { AnalyticsService } from "./analytics.service";
import { OverviewQueryDto } from "./dto/overview-query.dto";

@Controller("analytics")
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser, @Query() query: OverviewQueryDto) {
    return this.analyticsService.overview(user.organizationId, query.days ?? 30);
  }
}
