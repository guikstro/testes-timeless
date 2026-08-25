import { IsEmail, IsOptional, IsString, MinLength, IsUUID } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
