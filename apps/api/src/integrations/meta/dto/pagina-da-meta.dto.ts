import { Transform } from "class-transformer";
import { Matches, ValidateIf } from "class-validator";

/**
 * A Página do Facebook dos Insights.
 *
 * O id é o número que aparece no endereço do Business (`asset_id=`) e em
 * Configurações da Página. Null tira a Página, sem apagar o que já foi lido.
 */
export class PaginaDaMetaDto {
  @Transform(({ value }) => (typeof value === "string" ? value.replace(/\s/g, "") || null : value))
  @ValidateIf((dto: PaginaDaMetaDto) => dto.paginaId !== null)
  @Matches(/^\d{5,25}$/, { message: "Informe o id da Página, só os números." })
  paginaId!: string | null;
}
