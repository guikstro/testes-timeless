import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";

export class MudarOrcamentoDto {
  /**
   * Em centavos, inteiro.
   *
   * A API inteira fala em centavos por um motivo que este campo torna
   * concreto: aceitar reais aqui e converter depois deixaria um ponto no
   * sistema onde um número sem casa decimal vale cem vezes o pretendido, e é
   * o orçamento do cliente que está do outro lado.
   */
  @Type(() => Number)
  @IsInt({ message: "O orçamento diário precisa ser um valor inteiro em centavos." })
  @Min(1, { message: "O orçamento diário precisa ser maior que zero." })
  valorCentavos!: number;

  /**
   * Confirmação explícita de que o cliente aceita estourar a verba.
   *
   * Existe para o estouro ser uma decisão, e não um efeito colateral. Sem
   * isto, o teto da verba ou bloquearia casos legítimos ou viraria um aviso
   * que ninguém lê.
   */
  @IsOptional()
  @IsBoolean()
  confirmarEstouro?: boolean;
}
