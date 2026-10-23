import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

const OBJETIVOS = ["VENDAS", "PRESENCA_LOCAL", "AUDIENCIA"] as const;

/**
 * O perfil do negócio inteiro de uma vez: o formulário manda todos os campos,
 * e um campo vazio (null) é apagado. Tudo opcional, porque um perfil pela
 * metade já ajuda mais que nenhum.
 */
export class SalvaPerfilDoNegocioDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200)
  tipoDeNegocio?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  oferta?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(OBJETIVOS)
  objetivoPrincipal?: (typeof OBJETIVOS)[number] | null;

  @IsOptional() @IsArray() @ArrayMaxSize(3) @ArrayUnique() @IsIn(OBJETIVOS, { each: true })
  objetivosSecundarios?: (typeof OBJETIVOS)[number][];

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  publico?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  regiao?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  definicaoDeSucesso?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(1_000_000)
  metaVendasPorMes?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(2_000_000_000)
  metaCustoPorVendaCentavos?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(2_000_000_000)
  metaReceitaMensalCentavos?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(3650)
  cicloDeVendaDias?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(100)
  margemPercentual?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(2_000_000_000)
  custoMedioCentavos?: number | null;
}
