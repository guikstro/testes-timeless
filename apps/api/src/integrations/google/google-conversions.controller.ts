import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { AppException } from "../../common/exceptions/app-exception";
import { GoogleConversionsService } from "./google-conversions.service";
import { ListarConversoesDto } from "./dto/listar-conversoes.dto";

@Controller("integrations/google")
@UseGuards(JwtAuthGuard)
export class GoogleConversionsController {
  constructor(private readonly conversions: GoogleConversionsService) {}

  /** O que precisa voltar para o Google Ads no período, pronto para virar arquivo. */
  @Get("conversions")
  listar(@CurrentUser() user: AuthenticatedUser, @Query() query: ListarConversoesDto) {
    if (query.de > query.ate) {
      throw new AppException("VALIDATION_ERROR", "A data inicial não pode ser depois da final.", HttpStatus.BAD_REQUEST);
    }
    return this.conversions.listar(user.organizationId, { de: query.de, ate: query.ate });
  }
}
