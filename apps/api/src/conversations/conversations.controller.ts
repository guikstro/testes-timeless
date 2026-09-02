import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { ConversationsService } from "./conversations.service";
import { ListConversationsDto } from "./dto/list-conversations.dto";

@Controller("conversations")
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  /** A caixa de entrada: conversas da organização, a mais recente primeiro. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConversationsDto) {
    return this.conversations.list(user.organizationId, { status: query.status, search: query.search });
  }
}
