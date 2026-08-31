import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { ListLeadsDto } from "./dto/list-leads.dto";
import { LeadsService } from "./leads.service";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { SendMessageDto } from "./dto/send-message.dto";

@Controller("leads")
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListLeadsDto) {
    return this.leadsService.list(user.organizationId, query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.leadsService.findOne(user.organizationId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(user.organizationId, id, user.userId, dto);
  }

  @Post(":id/messages")
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.leadsService.sendMessage(user.organizationId, id, dto);
  }
}
