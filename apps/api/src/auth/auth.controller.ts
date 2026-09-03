import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AUTENTICACAO, CREDENCIAL } from "../common/throttling/limites";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "./jwt-payload.interface";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { ConfirmEmailDto } from "./dto/confirm-email.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Contexto da sessão para o shell da aplicação: quem é o usuário, em qual
   * organização ele está agindo, se é operador da plataforma e se esta é uma
   * sessão de impersonação. Reunido num endpoint só porque a UI precisa dos
   * quatro juntos para decidir o que renderizar (link de administração,
   * aviso de "você está dentro do cliente").
   */
  @Get("session")
  @UseGuards(JwtAuthGuard)
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getSession(user);
  }

  @Throttle({ default: AUTENTICACAO })
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: AUTENTICACAO })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Deliberately not behind JwtAuthGuard: logout must still revoke the
   * refresh token even when the (short-lived) access token has already
   * expired — the DTO's refresh token is itself the only thing it acts on.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Throttle({ default: AUTENTICACAO })
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: AUTENTICACAO })
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  /**
   * Devolvem um par novo de tokens: a troca derruba as outras sessões, e sem
   * o par novo quem trocou seria expulso pela própria ação.
   */
  @Throttle({ default: CREDENCIAL })
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  @Throttle({ default: CREDENCIAL })
  @Patch("email")
  @UseGuards(JwtAuthGuard)
  changeEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(user, dto);
  }

  /**
   * Confirma a troca do e-mail de acesso.
   *
   * Sem sessão de propósito: quem abre o link pode estar no leitor de e-mail
   * de outro aparelho, onde não há sessão. Quem prova a identidade aqui é o
   * token, e a senha atual já foi exigida no pedido.
   *
   * É POST e não GET porque varredor de link de provedor de e-mail abre GET
   * sozinho: uma confirmação por GET seria disparada antes de a pessoa ver o
   * e-mail.
   */
  @Throttle({ default: AUTENTICACAO })
  @Post("confirm-email")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(@Body() dto: ConfirmEmailDto): Promise<void> {
    await this.authService.confirmEmail(dto.token);
  }
}
