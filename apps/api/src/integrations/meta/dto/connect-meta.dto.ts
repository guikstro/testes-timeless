import { IsString, Matches, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class ConnectMetaDto {
  /**
   * Com ou sem `act_`: o Gerenciador de Anúncios mostra só o número, e a Meta
   * recusa a conta sem o prefixo. Quem digita não precisa saber disso.
   */
  @Transform(({ value }) => {
    if (typeof value !== "string") return value;
    const limpo = value.trim().replace(/\s/g, "");
    return /^\d+$/.test(limpo) ? `act_${limpo}` : limpo;
  })
  @IsString()
  @Matches(/^act_[A-Za-z0-9_]+$/, { message: "Informe o número da conta de anúncios, por exemplo act_1234567890." })
  adAccountId!: string;

  @IsString()
  @MinLength(1)
  accessToken!: string;
}
