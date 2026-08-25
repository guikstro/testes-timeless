import { IsString, MinLength } from "class-validator";

export class ConnectMetaDto {
  @IsString()
  @MinLength(1)
  adAccountId!: string;

  @IsString()
  @MinLength(1)
  accessToken!: string;
}
