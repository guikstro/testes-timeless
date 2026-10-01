/**
 * Desde quando uma fonte tem dado aqui, e o que isso faz com uma comparação.
 *
 * A Meta é buscada a partir da conexão (com 7 dias para trás) e o script do
 * Google a partir da primeira rodada (com 35, ou 13 meses na versão 3). Um
 * período que começa antes disso tem dias sem número nenhum, e a variação
 * contra ele compararia um mês inteiro com alguns dias.
 */

/** Dia civil AAAA-MM-DD. */
type Dia = string;

/** O que as telas de comparação recebem sobre a cobertura. */
export interface Cobertura {
  /** O primeiro dia com número de anúncio aqui. Null quando não se sabe, e então nada é restringido. */
  desde: Dia | null;
  /** A fonte que começa por último, e que por isso decide o `desde`. */
  limitadaPor: "META" | "GOOGLE" | null;
  /** O script do Google ainda não mandou os 13 meses anteriores: colar a versão nova resolve. */
  googleSemHistorico: boolean;
}

/** Um período que começa antes da cobertura tem dias sem dado: a variação contra ele não vale. */
export function comecaAntes(janela: { de: Dia } | null, desde: Dia | null): boolean {
  return Boolean(janela && desde && janela.de < desde);
}

/**
 * A cobertura de várias fontes juntas: a mais recente. Com a Meta desde
 * agosto e o Google desde setembro, os totais só estão completos a partir de
 * setembro. Fonte sem cobertura conhecida não restringe.
 */
export function coberturaDeTodas(desdes: (Dia | null)[]): Dia | null {
  const conhecidas = desdes.filter((desde): desde is Dia => desde !== null);
  return conhecidas.length > 0 ? conhecidas.sort().at(-1)! : null;
}

/** O dia civil `dias` antes de outro. */
export function diasAntes(dia: Dia, dias: number): Dia {
  return new Date(Date.parse(`${dia}T12:00:00.000Z`) - dias * 86_400_000).toISOString().slice(0, 10);
}
