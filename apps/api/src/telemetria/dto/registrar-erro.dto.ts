import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Tudo tem teto porque vem do navegador e termina num log. Sem limite, uma
 * pilha enorme, ou alguém de má-fé, encheria o log e esconderia o resto.
 */
export class RegistrarErroDto {
  @IsString()
  @MaxLength(500)
  mensagem!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  caminho?: string;

  /** O `digest` do Next, que liga o erro do navegador ao log do servidor. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  digest?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  pilha?: string;
}
