import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(["QUALIFIED", "MEETING_SCHEDULED", "WON"])
  status?: "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

  @IsOptional()
  @IsInt()
  @Min(0)
  revenueCents?: number;

  /**
   * Desqualificar (`true`) ou reativar (`false`). Não é um valor de `status`:
   * é uma saída lateral do funil, e o lead preserva o estágio a que chegou.
   */
  @IsOptional()
  @IsBoolean()
  disqualified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  disqualifiedReason?: string;
}
