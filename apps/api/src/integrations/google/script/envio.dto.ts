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

/** Um número de presença local: ligações, rotas, visitas. Só os maiores que zero vêm. */
export class MetricaLocalDoEnvioDto {
  @Matches(/^\d{1,20}$/)
  campanha!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data!: string;

  @IsIn(["LIGACOES_DOS_ANUNCIOS", "EXIBICOES_DO_TELEFONE", "ROTAS", "LIGACOES_CONVERSAO", "VISITAS_A_LOJA"])
  metrica!: string;

  @IsNumber()
  @Min(0)
  @Max(1e9)
  valor!: number;
}

/** O que cada parte nova conseguiu ler: "ok" ou "falhou: motivo". */
export class PartesDoEnvioDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  ligacoes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  acoesLocais?: string;
}

export class EnvioDoScriptDto {
  /** Ausente no script da primeira versão, que só mandava gasto. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  versao?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PartesDoEnvioDto)
  partes?: PartesDoEnvioDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50_000)
  @ValidateNested({ each: true })
  @Type(() => MetricaLocalDoEnvioDto)
  locais?: MetricaLocalDoEnvioDto[];

  @ValidateNested()
  @Type(() => ContaDoEnvioDto)
  conta!: ContaDoEnvioDto;

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CampanhaDoEnvioDto)
  campanhas!: CampanhaDoEnvioDto[];
}
