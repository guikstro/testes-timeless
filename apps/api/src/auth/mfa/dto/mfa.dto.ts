import { IsString, Length, MinLength } from "class-validator";

export class CodigoMfaDto {
  /**
   * Seis dígitos do aplicativo, ou um código de recuperação (`ACDEF-GHJKM`).
   *
   * O comprimento aceita os dois de propósito. Separar em dois campos faria a
   * tela perguntar de antemão qual deles a pessoa tem, que é exatamente a
   * pergunta que ela não consegue responder quando perdeu o telefone.
   */
  @IsString()
  @Length(6, 32, { message: "Informe o código do aplicativo ou um código de recuperação." })
  codigo!: string;
}

export class DesativarMfaDto extends CodigoMfaDto {
  @IsString()
  @MinLength(1, { message: "Informe sua senha." })
  senha!: string;
}

export class CompletarLoginDto extends CodigoMfaDto {
  @IsString()
  @MinLength(1)
  desafio!: string;
}
