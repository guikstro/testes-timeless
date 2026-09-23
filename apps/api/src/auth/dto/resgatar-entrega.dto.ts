import { IsString, Length } from "class-validator";

export class ResgatarEntregaDto {
  /**
   * O código de uso único gerado pela administração.
   *
   * Comprimento limitado para uma string enorme não virar consulta ao Redis:
   * a validação recusa antes de a chave ser montada.
   */
  @IsString()
  @Length(16, 128)
  codigo!: string;
}
