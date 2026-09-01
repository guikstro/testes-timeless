import { Type } from "class-transformer";
import { IsInt, IsString, MaxLength, Min, MinLength } from "class-validator";

export class PreverCsvDto {
  /**
   * Conteúdo do arquivo como texto.
   *
   * Vem no corpo em vez de upload de arquivo: o servidor não precisa guardar
   * nada, e evitar armazenamento temporário elimina a pergunta de quem apaga
   * e quando. O teto de 2MB cobre com folga um relatório de um ano.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  conteudo!: string;
}

export class ImportarCsvDto extends PreverCsvDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  colunaData!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  colunaValor!: number;
}
