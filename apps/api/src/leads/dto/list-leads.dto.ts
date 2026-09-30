import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

/**
 * DTO próprio, e não `@Query` solto: o pipe global roda com
 * `forbidNonWhitelisted`, então qualquer parâmetro não declarado devolveria
 * 400 na cara de quem só quis filtrar uma lista.
 */
export class ListLeadsDto extends PaginationQueryDto {
  /** Nome ou telefone. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /**
   * `DISQUALIFIED` não é um valor de status no banco: é a saída lateral do
   * funil. Aqui ele entra como filtro porque, para quem procura, "descartados"
   * é uma categoria como qualquer outra.
   */
  @IsOptional()
  @IsIn(["NEW", "IN_PROGRESS", "QUALIFIED", "MEETING_SCHEDULED", "WON", "DISQUALIFIED", "AWAITING"])
  status?: "NEW" | "IN_PROGRESS" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON" | "DISQUALIFIED" | "AWAITING";

  /**
   * De quem é o lead: `eu` (quem pergunta), `nenhum` (sem responsável) ou o
   * id de alguém da organização.
   */
  @IsOptional()
  @Matches(/^(eu|nenhum|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: "responsavel deve ser eu, nenhum ou o id de uma pessoa.",
  })
  responsavel?: string;
}
