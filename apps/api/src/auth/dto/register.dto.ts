import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  organizationName!: string;

  /** Marcado na tela de cadastro. Opcional para não quebrar quem cadastra pela API. */
  @IsOptional()
  @IsBoolean()
  aceitaOsTermos?: boolean;
}
