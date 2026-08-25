import { IsString, MinLength } from "class-validator";

export class ConnectMetaCapiDto {
  @IsString()
  @MinLength(1)
  pixelId!: string;

  @IsString()
  @MinLength(1)
  capiAccessToken!: string;
}
