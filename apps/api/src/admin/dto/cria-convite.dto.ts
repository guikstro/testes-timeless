import { ArrayMinSize, IsArray, IsEmail, IsIn, IsUUID, ValidateIf } from "class-validator";
import { Transform } from "class-transformer";
import { AREAS, Area } from "../../common/decorators/areas.decorator";

export class CriaConviteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Informe um e-mail válido." })
  email!: string;

  /** `timeless`: entra na equipe, com acesso a tudo. `cliente`: um cliente, só nas áreas escolhidas. */
  @IsIn(["timeless", "cliente"])
  acesso!: "timeless" | "cliente";

  @ValidateIf((dto: CriaConviteDto) => dto.acesso === "cliente")
  @IsUUID(undefined, { message: "Escolha o cliente." })
  organizationId?: string;

  @ValidateIf((dto: CriaConviteDto) => dto.acesso === "cliente")
  @IsArray()
  @ArrayMinSize(1, { message: "Escolha ao menos uma área." })
  @IsIn(AREAS, { each: true })
  areas?: Area[];
}
