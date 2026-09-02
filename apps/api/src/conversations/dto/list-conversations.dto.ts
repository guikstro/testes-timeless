import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { FiltroDaCaixa } from "../conversation-list";

const FILTROS: FiltroDaCaixa[] = ["all", "unread", "awaiting"];

export class ListConversationsDto {
  @IsOptional()
  @IsIn(FILTROS)
  status?: FiltroDaCaixa;

  @IsOptional()
  @IsString()
  // Teto para uma busca não virar um padrão gigante contra a coluna de nome.
  @MaxLength(80)
  search?: string;
}
