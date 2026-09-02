import { Transform } from "class-transformer";
import { IsBooleanString, IsISO8601, IsIn, IsOptional } from "class-validator";

const TIPOS = [
  "lead.created",
  "lead.qualified",
  "lead.won",
  "lead.stage_changed",
  "message.received",
  "message.failed",
] as const;

export class ListarNotificacoesDto {
  /** Data da última linha já vista, para continuar a lista sem pular itens. */
  @IsOptional()
  @IsISO8601({ strict: true })
  antesDe?: string;

  @IsOptional()
  @IsIn(TIPOS as unknown as string[])
  tipo?: string;

  @IsOptional()
  @IsBooleanString()
  @Transform(({ value }) => value === "true")
  naoLidas?: boolean;
}
