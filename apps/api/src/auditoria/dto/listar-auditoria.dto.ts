import { IsIn, IsOptional, IsUUID } from "class-validator";
import { CATEGORIAS, CategoriaDeAuditoria } from "../categorias";

export class ListarAuditoriaDto {
  @IsOptional()
  @IsIn(Object.keys(CATEGORIAS))
  categoria?: CategoriaDeAuditoria;

  @IsOptional()
  @IsUUID()
  pessoa?: string;

  /** Id da última linha da página anterior. */
  @IsOptional()
  @IsUUID()
  depoisDe?: string;
}
