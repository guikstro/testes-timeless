import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, Matches } from "class-validator";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { Areas } from "../../../common/decorators/areas.decorator";
import { AuthenticatedUser } from "../../../auth/jwt-payload.interface";
import { AppException } from "../../../common/exceptions/app-exception";
import { autorDe } from "../../../auditoria/auditoria.service";
import { GoogleAdsScriptService } from "./google-ads-script.service";
import { EnvioDoScriptDto } from "./envio.dto";

class PeriodoDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  de?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  ate?: string;
}

/** O mês corrente, de 1º até hoje, em Brasília. */
function mesCorrente(): { de: string; ate: string } {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

@Controller("integrations/google/script")
@UseGuards(JwtAuthGuard)
@Areas("integracoes")
export class GoogleAdsScriptController {
  constructor(private readonly servico: GoogleAdsScriptService) {}

  @Get()
  situacao(@CurrentUser() user: AuthenticatedUser, @Query() periodo: PeriodoDto) {
    const padrao = mesCorrente();
    const de = periodo.de ?? padrao.de;
    const ate = periodo.ate ?? padrao.ate;
    if (de > ate) {
      throw new AppException("VALIDATION_ERROR", "A data inicial não pode ser depois da final.", HttpStatus.BAD_REQUEST);
    }
    return this.servico.situacao(user.organizationId, { de, ate });
  }

  /**
   * Gera o script. Só dono e administrador: a chave dentro dele escreve gasto
   * na conta, e quem só trabalha os leads não precisa disso.
   */
  @Post()
  geraScript(@CurrentUser() user: AuthenticatedUser) {
    exigeGestao(user);
    return this.servico.geraScript(autorDe(user));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async desconecta(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    exigeGestao(user);
    await this.servico.desconecta(autorDe(user));
  }
}

/**
 * O endereço que o script chama, de dentro do Google Ads.
 *
 * Sem sessão: quem chama é o Google, e o que identifica o cliente é a chave no
 * cabeçalho. Limite de envios por minuto porque é uma porta aberta; o script
 * de verdade chama uma vez por hora. O limite é folgado porque é contado por
 * IP, e os scripts de todas as contas saem dos mesmos servidores do Google.
 */
@Controller("publico/google-ads")
export class EnvioDoGoogleAdsController {
  constructor(private readonly servico: GoogleAdsScriptService) {}

  @Post("envio")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  recebe(@Headers("x-chave-timeless") chave: string | undefined, @Body() envio: EnvioDoScriptDto) {
    return this.servico.recebe(chave, envio);
  }
}

function exigeGestao(user: AuthenticatedUser): void {
  if (user.role === "MEMBER") {
    throw new AppException(
      "FORBIDDEN",
      "Só o dono e os administradores ligam o Google Ads.",
      HttpStatus.FORBIDDEN,
    );
  }
}
