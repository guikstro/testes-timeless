import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
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
  @IsIn(["NEW", "QUALIFIED", "MEETING_SCHEDULED", "WON", "DISQUALIFIED", "AWAITING"])
  status?: "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON" | "DISQUALIFIED" | "AWAITING";
}
