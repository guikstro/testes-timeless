import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { LeadsService } from "./leads.service";

@Controller("leads")
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.leadsService.list(user.organizationId, pagination);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.leadsService.findOne(user.organizationId, id);
  }
}
