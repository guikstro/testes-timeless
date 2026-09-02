import { IsISO8601, IsOptional, Matches, ValidateIf } from "class-validator";

/**
 * Dia civil, sem hora e sem fuso.
 *
 * `Matches` obriga o formato de data pura; `IsISO8601` em modo estrito é o que
 * rejeita 31 de fevereiro, que passaria pelo regex e viraria 3 de março
 * silenciosamente ao ser convertido em Date.
 */
const DIA_CIVIL = [
  Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "$property deve estar no formato AAAA-MM-DD." }),
  IsISO8601({ strict: true }, { message: "$property não é uma data existente." }),
];

function DiaCivil() {
  return (alvo: object, chave: string) => DIA_CIVIL.forEach((decorador) => decorador(alvo, chave));
}

export class CampanhasQueryDto {
  @DiaCivil()
  de!: string;

  @DiaCivil()
  ate!: string;

  /**
   * Período de comparação, escolhido à mão: pode ser o mês anterior, mas
   * também julho contra março. As duas pontas vêm juntas ou nenhuma vem.
   */
  @IsOptional()
  @ValidateIf((dto: CampanhasQueryDto) => dto.compararDe !== undefined || dto.compararAte !== undefined)
  @DiaCivil()
  compararDe?: string;

  @IsOptional()
  @ValidateIf((dto: CampanhasQueryDto) => dto.compararDe !== undefined || dto.compararAte !== undefined)
  @DiaCivil()
  compararAte?: string;
}
