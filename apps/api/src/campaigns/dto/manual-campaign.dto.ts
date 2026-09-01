import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { AdPlatform } from "@prisma/client";

export class CriarCampanhaManualDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(AdPlatform)
  platform!: AdPlatform;

  /**
   * O id da campanha na plataforma de origem.
   *
   * Não é obrigatório: quem só quer lançar o gasto para medir retorno não
   * precisa procurar o id. Mas informá-lo é o que permite ligar os cliques
   * rastreados a esta campanha, e mais tarde deixar a sincronização assumir a
   * mesma linha em vez de criar uma duplicada.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  externalId?: string;
}

export class RegistrarGastoDto {
  /** Dia do gasto, no formato AAAA-MM-DD. */
  @IsDateString()
  date!: string;

  /** Em centavos, nunca em reais quebrados: ponto flutuante perde dinheiro. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  spendCents!: number;
}
