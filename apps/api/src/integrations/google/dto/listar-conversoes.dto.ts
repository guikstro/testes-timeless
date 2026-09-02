import { IsISO8601, Matches } from "class-validator";

/** Dia civil, mesmo formato do resto do produto. */
const DIA = [
  Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "$property deve estar no formato AAAA-MM-DD." }),
  IsISO8601({ strict: true }, { message: "$property não é uma data existente." }),
];

function DiaCivil() {
  return (alvo: object, chave: string) => DIA.forEach((decorador) => decorador(alvo, chave));
}

export class ListarConversoesDto {
  @DiaCivil()
  de!: string;

  @DiaCivil()
  ate!: string;
}
