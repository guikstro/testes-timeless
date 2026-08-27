import { IsString, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  // Limite prático do WhatsApp para mensagem de texto.
  @MaxLength(4096)
  text!: string;
}
