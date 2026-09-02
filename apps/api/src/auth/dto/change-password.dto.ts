import { IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  /** A senha atual, exigida mesmo com a sessão aberta: uma aba esquecida aberta não pode virar troca de senha. */
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
