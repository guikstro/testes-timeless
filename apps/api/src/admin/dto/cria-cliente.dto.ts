import { IsString, Length } from "class-validator";
import { Transform } from "class-transformer";

export class CriaClienteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  nome!: string;
}
