import { IsString, IsUUID, Length } from "class-validator";

export class TransferePosseDto {
  /** Quem passa a ser dono. Precisa ser da equipe Timeless e já estar na conta. */
  @IsUUID(undefined, { message: "Escolha quem vai ser o dono." })
  userId!: string;

  /** Código do app autenticador, ou um código de recuperação. */
  @IsString()
  @Length(6, 32, { message: "Digite o código do autenticador." })
  codigo!: string;
}
