import { IsEnum, IsString, MinLength } from "class-validator";

export enum ClassificationTargetDto {
  QUALIFIED = "QUALIFIED",
  MEETING_SCHEDULED = "MEETING_SCHEDULED",
  WON = "WON",
}

export class CreateClassificationRuleDto {
  @IsEnum(ClassificationTargetDto)
  targetStatus!: ClassificationTargetDto;

  @IsString()
  @MinLength(2)
  phrase!: string;
}
