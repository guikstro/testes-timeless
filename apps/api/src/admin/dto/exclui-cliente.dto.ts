import { IsString, Length } from "class-validator";

export class ExcluiClienteDto {
  /** A frase "Quero excluir o <nome do cliente>", digitada pela pessoa. */
  @IsString()
  @Length(1, 200)
  confirmacao!: string;

  /** Código do app autenticador, ou um código de recuperação. */
  @IsString()
  @Length(6, 32)
  codigo!: string;
}
