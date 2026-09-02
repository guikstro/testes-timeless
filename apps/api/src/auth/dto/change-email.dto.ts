import { IsEmail, IsString } from "class-validator";

export class ChangeEmailDto {
  @IsString()
  currentPassword!: string;

  @IsEmail({}, { message: "Informe um e-mail válido." })
  newEmail!: string;
}
