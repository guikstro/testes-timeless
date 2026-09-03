import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsHexColor, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { Type } from "class-transformer";

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  /**
   * URL da logo. String vazia limpa o campo — sem isso não haveria como
   * remover uma logo depois de definida, só trocá-la por outra.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsUrl({ require_protocol: true, protocols: ["https"] })
  @MaxLength(2048)
  logoUrl?: string;

  /** Acento em hex. String vazia volta ao acento padrão do produto. */
  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsHexColor()
  brandColor?: string;

  /**
   * Nomes das ações de conversão no Google Ads. String vazia limpa o campo,
   * pelo mesmo motivo da logo: sem isso não haveria como desfazer.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  googleConversionQualified?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  googleConversionWon?: string;

  /**
   * Horário de atendimento. Ligar muda como todo o histórico de tempo de
   * resposta é lido, então é uma escolha explícita e não um padrão herdado.
   */
  @IsOptional()
  @IsBoolean()
  expedienteAtivo?: boolean;

  /** Dias atendidos, de 0 (domingo) a 6. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  expedienteDias?: number[];

  /** Minutos desde a meia-noite. 1439 é 23:59; abrir depois disso não existe. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  expedienteInicio?: number;

  /** Até 1440, que é a meia-noite do dia seguinte, para quem fecha às 24h. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  expedienteFim?: number;
}
