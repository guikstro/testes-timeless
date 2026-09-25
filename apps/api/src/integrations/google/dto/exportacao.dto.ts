import { IsInt, Max, Min } from "class-validator";

export class ExportacaoDto {
  /** O período exportado, em dias, como a tela oferece. */
  @IsInt()
  @Min(1)
  @Max(366)
  dias!: number;

  /** Quantas conversões foram para o arquivo. */
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  linhas!: number;
}
