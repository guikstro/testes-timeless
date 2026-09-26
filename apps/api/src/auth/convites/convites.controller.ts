import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, Length } from "class-validator";
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

/** A página pública do convite. Quem autentica é o token do link. */
@Controller("publico/convites")
@Throttle({ default: AUTENTICACAO })
export class ConvitesController {
  constructor(private readonly convites: ConvitesService) {}

  @Get(":token")
  le(@Param("token") token: string) {
    return this.convites.le(token);
  }

  @Post(":token")
  aceita(@Param("token") token: string, @Body() dto: AceitaConviteDto, @Contexto() contexto: ContextoDoCliente) {
    return this.convites.aceita(token, dto.nome, dto.senha, contexto);
  }
}
