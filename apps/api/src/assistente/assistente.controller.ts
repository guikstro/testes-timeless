import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requer } from "../common/permissoes/requer.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { PainelService } from "./painel.service";
import { BuscaService } from "./busca.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class AssistenteController {
  constructor(
    private readonly painel: PainelService,
    private readonly busca: BuscaService,
  ) {}

  /** O painel que a pessoa montou (ou o padrão). */
  @Requer("analytics.read")
  @Get("painel")
  lePainel(@CurrentUser() user: AuthenticatedUser) {
    return this.painel.le(user.organizationId, user.userId);
  }

  @Requer("analytics.read")
  @Put("painel")
  salvaPainel(@CurrentUser() user: AuthenticatedUser, @Body() corpo: { blocos?: unknown }) {
    return this.painel.salva(user.organizationId, user.userId, corpo?.blocos);
  }

  /** A barra de perguntas. Lê conversas, então pede a mesma permissão delas. */
  @Requer("conversation.read")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("busca")
  pergunta(@CurrentUser() user: AuthenticatedUser, @Body() corpo: { pergunta?: unknown }) {
    return this.busca.pergunta(user.organizationId, corpo?.pergunta);
  }
}
