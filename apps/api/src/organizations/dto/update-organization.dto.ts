import { IsHexColor, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from "class-validator";

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  /**
   * URL da logo. String vazia limpa o campo — sem isso não haveria como
   * remover uma logo depois de definida, só trocá-la por outra.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsUrl({ require_protocol: true, protocols: ["https"] })
  @MaxLength(2048)
  logoUrl?: string;

  /** Acento em hex. String vazia volta ao acento padrão do produto. */
  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsHexColor()
  brandColor?: string;
}
