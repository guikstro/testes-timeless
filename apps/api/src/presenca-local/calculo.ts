/**
 * As contas do painel de presença local, puras para serem testadas sem banco.
 */

export interface Janela {
  de: string;
  ate: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00.000Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** Os últimos `dias` até hoje, e a janela do mesmo tamanho logo antes. */
export function janelas(hoje: string, dias: number): { atual: Janela; anterior: Janela } {
  const de = somaDias(hoje, -(dias - 1));
  return {
    atual: { de, ate: hoje },
    anterior: { de: somaDias(de, -dias), ate: somaDias(de, -1) },
  };
}

/**
 * Custo por ação, em centavos. `null` quando não há o que dividir: sem ação no
 * período o custo não é zero nem infinito, é "não dá para dizer".
 */
export function custoPor(gastoCentavos: number | null, acoes: number | null): number | null {
  if (gastoCentavos === null || acoes === null || acoes <= 0) return null;
  return Math.round(gastoCentavos / acoes);
}

/** Todos os dias da janela, para a série não pular dia sem número. */
export function diasDa(janela: Janela): string[] {
  const lista: string[] = [];
  for (let dia = janela.de; dia <= janela.ate; dia = somaDias(dia, 1)) lista.push(dia);
  return lista;
}
