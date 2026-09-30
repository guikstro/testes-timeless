import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { FILTRO_DE_RESPONSAVEL } from "../../leads/dto/list-leads.dto";

/**
 * Os recortes da aba Funil.
 *
 * O período é o mesmo da visão geral, em dias contados a partir de hoje: o
 * funil vive numa aba do dashboard, e trocar de aba não pode trocar o período.
 */
export class FunilQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;

  /** Id da campanha na plataforma, ou `nenhuma` para os leads sem campanha. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  campanha?: string;

  /** Chave da origem, a mesma da tabela de origens do dashboard. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  origem?: string;

  /** Ver `FILTRO_DE_RESPONSAVEL`. */
  @IsOptional()
  @Matches(FILTRO_DE_RESPONSAVEL, { message: "responsavel deve ser eu, nenhum ou o id de uma pessoa." })
  responsavel?: string;
}
