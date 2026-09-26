import { IsString, Length, Matches } from "class-validator";
import { Transform } from "class-transformer";

export class CriaClienteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  nome!: string;

  /** A cor do cliente no sistema. Formato do `<input type="color">`. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @Matches(/^#[0-9a-f]{6}$/, { message: "Escolha uma cor válida." })
  cor!: string;
}
