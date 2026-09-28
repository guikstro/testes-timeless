import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, Length } from "class-validator";
import { Transform } from "class-transformer";
import { AUTENTICACAO } from "../../common/throttling/limites";
import { Contexto, ContextoDoCliente } from "../sessoes/contexto-do-cliente";
import { ConvitesService } from "./convites.service";

class AceitaConviteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  nome!: string;

  @IsString()
  @Length(8, 128)
  senha!: string;
}

class AceitaComSenhaDto {
  @IsString()
  @Length(1, 128)
  senha!: string;

  /** Só para quem usa autenticador: os seis dígitos, ou um código de recuperação. */
  @IsOptional()
  @IsString()
  @Length(6, 32)
  codigo?: string;
}

/** A página pública do convite. Quem autentica é o token do link. */
@Controller("publico/convites")
@Throttle({ default: AUTENTICACAO })
export class ConvitesController {
  constructor(private readonly convites: ConvitesService) {}

  @Get(":token")
  le(@Param("token") token: string) {
    return this.convites.le(token);
  }

  /** Aceite de quem já tem conta: a senha dela, e o código do autenticador se ela usar. */
  @Post(":token/com-senha")
  @HttpCode(HttpStatus.OK)
  aceitaComSenha(@Param("token") token: string, @Body() dto: AceitaComSenhaDto, @Contexto() contexto: ContextoDoCliente) {
    return this.convites.aceitaComSenha(token, dto.senha, dto.codigo, contexto);
  }

  @Post(":token")
  aceita(@Param("token") token: string, @Body() dto: AceitaConviteDto, @Contexto() contexto: ContextoDoCliente) {
    return this.convites.aceita(token, dto.nome, dto.senha, contexto);
  }
}
