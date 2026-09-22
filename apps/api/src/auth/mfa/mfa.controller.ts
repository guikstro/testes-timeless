import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../jwt-payload.interface";
import { AuthService } from "../auth.service";
import { MfaService } from "./mfa.service";
import { CodigoMfaDto, DesativarMfaDto } from "./dto/mfa.dto";

/**
 * Verificação em duas etapas.
 *
 * Todas as rotas daqui exigem sessão: configurar o segundo fator é coisa de
 * quem já entrou. A conferência durante o login mora em `/auth/mfa/completar`,
 * que é pública por definição e fica no controller de autenticação.
 */
@Controller("auth/mfa")
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  situacao(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.situacao(user.userId);
  }

  /** Gera o segredo e devolve o endereço do QR. Ainda não liga nada. */
  @Post("inscricao")
  iniciar(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.iniciarInscricao(user.userId);
  }

  @Delete("inscricao")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelar(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.mfa.cancelarInscricao(user.userId);
  }

  /**
   * Confirma a inscrição e devolve os códigos de recuperação.
   *
   * Limite apertado: seis dígitos são adivinháveis por força bruta em pouco
   * tempo, e um limite generoso aqui anularia o fator inteiro.
   */
  @Post("inscricao/confirmar")
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  confirmar(@CurrentUser() user: AuthenticatedUser, @Body() dto: CodigoMfaDto) {
    return this.mfa.confirmarInscricao(user.userId, dto.codigo);
  }

  @Post("codigos")
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  regenerar(@CurrentUser() user: AuthenticatedUser, @Body() dto: CodigoMfaDto) {
    return this.mfa.regenerarCodigos(user.userId, dto.codigo);
  }

  /** Desligar exige senha e código. Ver `AuthService.desativarMfa`. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  async desativar(@CurrentUser() user: AuthenticatedUser, @Body() dto: DesativarMfaDto): Promise<void> {
    await this.auth.desativarMfa(user.userId, dto.senha, dto.codigo);
  }
}
