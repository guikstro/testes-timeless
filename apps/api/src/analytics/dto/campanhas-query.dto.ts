import { IsOptional, ValidateIf } from "class-validator";
import { DiaCivil } from "../../common/validation/dia-civil";

export class CampanhasQueryDto {
  @DiaCivil()
  de!: string;

  @DiaCivil()
  ate!: string;

  /**
   * Período de comparação, escolhido à mão: pode ser o mês anterior, mas
   * também julho contra março. As duas pontas vêm juntas ou nenhuma vem.
   */
  @IsOptional()
  @ValidateIf((dto: CampanhasQueryDto) => dto.compararDe !== undefined || dto.compararAte !== undefined)
  @DiaCivil()
  compararDe?: string;

  @IsOptional()
  @ValidateIf((dto: CampanhasQueryDto) => dto.compararDe !== undefined || dto.compararAte !== undefined)
  @DiaCivil()
  compararAte?: string;
}
