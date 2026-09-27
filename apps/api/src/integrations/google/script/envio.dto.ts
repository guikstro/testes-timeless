import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/*
  O corpo vem de fora, de um script que qualquer um com a chave pode editar.
  Tudo tem teto: quantidade de campanhas, de dias, tamanho de texto e valor.
*/

export class DiaDoEnvioDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data!: string;

  @IsInt()
  @Min(0)
  @Max(1e15)
  custoMicros!: number;

  @IsInt()
  @Min(0)
  impressoes!: number;

  @IsInt()
  @Min(0)
  cliques!: number;

  @IsNumber()
  @Min(0)
  conversoes!: number;

  @IsNumber()
  @Min(0)
  valorConversoes!: number;
}

export class CampanhaDoEnvioDto {
  @Matches(/^\d{1,20}$/)
  id!: string;

  @IsString()
  @MaxLength(255)
  nome!: string;

  @IsIn(["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"])
  status!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orcamentoMicros?: number | null;

  @IsArray()
  @ArrayMaxSize(62)
  @ValidateNested({ each: true })
  @Type(() => DiaDoEnvioDto)
  dias!: DiaDoEnvioDto[];
}

export class ContaDoEnvioDto {
  @Matches(/^\d{10}$/)
  id!: string;

  @IsString()
  @MaxLength(255)
  nome!: string;

  @Matches(/^[A-Z]{3}$/)
  moeda!: string;
}

export class EnvioDoScriptDto {
  @ValidateNested()
  @Type(() => ContaDoEnvioDto)
  conta!: ContaDoEnvioDto;

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CampanhaDoEnvioDto)
  campanhas!: CampanhaDoEnvioDto[];
}
