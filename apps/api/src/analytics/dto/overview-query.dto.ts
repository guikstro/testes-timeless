import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

export class OverviewQueryDto {
  /** Janela em dias, contada a partir de hoje. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DAYS)
  days?: number = DEFAULT_DAYS;
}
