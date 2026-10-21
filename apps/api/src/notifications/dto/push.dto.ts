import { Type } from "class-transformer";
import { IsNotEmptyObject, IsObject, IsString, IsUrl, MaxLength, ValidateNested } from "class-validator";

class ChavesDoPushDto {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

export class InscreverPushDto {
  // Só endereços https: o navegador nunca entrega outro, e isto impede que a
  // API seja usada para fazer o servidor chamar um endereço interno.
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(1000)
  endpoint!: string;

  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => ChavesDoPushDto)
  keys!: ChavesDoPushDto;
}

export class CancelarPushDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}
