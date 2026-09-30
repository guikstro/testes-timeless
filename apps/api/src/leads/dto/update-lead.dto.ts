import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(["IN_PROGRESS", "QUALIFIED", "MEETING_SCHEDULED", "WON"])
  status?: "IN_PROGRESS" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

  @IsOptional()
  @IsInt()
  @Min(0)
  revenueCents?: number;

  /**
   * Marcar como perdido (`true`) ou reativar (`false`). Não é um valor de
   * `status`: é uma saída lateral do funil, e o lead preserva o estágio a
   * que chegou. No banco o nome é "desqualificado", de antes da tela chamar
   * de perdido.
   */
  @IsOptional()
  @IsBoolean()
  disqualified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  disqualifiedReason?: string;

  /*
    Acompanhamento. Em todos, `null` limpa o campo e a ausência mantém o que
    está: é o que deixa a tela mandar só o que mudou.
  */

  /** Alguém da organização. Quem é de fora é recusado pelo serviço. */
  @IsOptional()
  @IsUUID()
  responsavelId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000_00)
  valorPotencialCentavos?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  proximaAcao?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  proximaAcaoEm?: string | null;
}
