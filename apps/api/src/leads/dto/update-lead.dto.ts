import { IsIn, IsInt, IsOptional, Min } from "class-validator";

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(["QUALIFIED", "WON"])
  status?: "QUALIFIED" | "WON";

  @IsOptional()
  @IsInt()
  @Min(0)
  revenueCents?: number;
}
