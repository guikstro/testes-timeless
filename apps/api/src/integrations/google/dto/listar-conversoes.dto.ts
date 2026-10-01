import { DiaCivil } from "../../../common/validation/dia-civil";

export class ListarConversoesDto {
  @DiaCivil()
  de!: string;

  @DiaCivil()
  ate!: string;
}
