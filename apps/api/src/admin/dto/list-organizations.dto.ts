import { IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

/**
 * Estende a paginação em vez de receber `search` como um `@Query()` solto:
 * o ValidationPipe global roda com `forbidNonWhitelisted`, então qualquer
 * parâmetro fora do DTO faz a requisição inteira falhar com 400.
 */
export class ListOrganizationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
