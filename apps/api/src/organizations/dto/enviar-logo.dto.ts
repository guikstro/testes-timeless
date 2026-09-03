import { IsString, MaxLength, MinLength } from "class-validator";

export class EnviarLogoDto {
  /**
   * A imagem como data URL em base64.
   *
   * O teto aqui é grosseiro de propósito: a validação real olha os bytes
   * decodificados. Ele existe só para uma string absurda não chegar ao
   * decodificador.
   */
  @IsString()
  @MinLength(32)
  @MaxLength(4 * 1024 * 1024)
  arquivo!: string;
}
