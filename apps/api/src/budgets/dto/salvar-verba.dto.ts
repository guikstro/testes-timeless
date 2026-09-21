import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class SalvarVerbaDto {
  /** Dia civil em que a verba passa a valer, no formato AAAA-MM-DD. */
  @IsDateString()
  de!: string;

  /**
   * Fim da verba. Opcional porque as duas formas reais são diferentes: verba
   * mensal tem fim de mês, e depósito de crédito vale até acabar.
   */
  @IsOptional()
  @IsDateString()
  ate?: string;

  /** Em centavos, nunca em reais quebrados: ponto flutuante perde dinheiro. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  valorCentavos!: number;

  /** Como o cliente chama esta verba. Ex.: "Setembro", "Crédito de lançamento". */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  rotulo?: string;
}
