import { IsOptional, IsString, MinLength } from "class-validator";

export class ConnectWhatsAppDto {
  @IsString()
  @MinLength(1)
  phoneNumberId!: string;

  @IsString()
  @MinLength(1)
  displayPhoneNumber!: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}
