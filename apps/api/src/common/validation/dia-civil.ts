import { IsISO8601, Matches } from "class-validator";

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

export function DiaCivil() {
  return (alvo: object, chave: string) => DIA_CIVIL.forEach((decorador) => decorador(alvo, chave));
}
