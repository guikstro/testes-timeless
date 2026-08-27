import { IsEmail, IsEnum } from "class-validator";
import { PlatformRole } from "@prisma/client";

export class UpsertOperatorDto {
  /** O usuário precisa já existir: promover não cria conta nem define senha. */
  @IsEmail({}, { message: "Informe um e-mail válido." })
  email!: string;

  @IsEnum(PlatformRole, { message: "Nível inválido." })
  role!: PlatformRole;
}
