import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class IniciaConexaoDto {
  /** Para onde voltar no site depois do Google. Só dentro de /clientes; o resto vira /clientes. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  volta?: string;
}

export class ConcluiConexaoDto {
  @IsString()
  @MaxLength(2000)
  codigo!: string;

  @IsString()
  @MaxLength(2000)
  estado!: string;
}

export class DefineLocaisDto {
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^locations\/\d{1,30}$/, { each: true, message: "Cada perfil precisa ser um local do Google, como locations/123." })
  locais!: string[];
}
