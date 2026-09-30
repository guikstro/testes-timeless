/**
 * As contas do acompanhamento do lead, puras para serem testadas sem tela.
 */

/** Quem cuida do lead. */
export interface Responsavel {
  id: string;
  name: string;
}

/**
 * O recorte por responsável que a URL pode pedir: `eu`, `nenhum` ou o id de
 * uma pessoa. Conferido antes de ir para a API, que recusaria o resto com
 * erro e derrubaria a tela inteira por causa de um link mal copiado.
 */
export const FILTRO_DE_RESPONSAVEL = /^(eu|nenhum|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Valor em reais escrito por gente, em centavos.
 *
 * Aceita "1.500", "1.500,00", "1500", "1500,5" e "R$ 1.500": no Brasil o
 * ponto separa milhar e a vírgula separa centavos. Trocar só a vírgula por
 * ponto, como fazia o campo de receita, leria "1.500" como um real e meio.
 *
 * Vazio é `null` (limpar o campo); texto que não é número é `undefined`.
 */
export function centavosDoTexto(texto: string): number | null | undefined {
  const limpo = texto.replace(/R\$|\s/g, "");
  if (!limpo) return null;

  let normal = limpo;
  if (limpo.includes(",")) normal = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normal = limpo.replace(/\./g, "");

  if (!/^\d+(\.\d+)?$/.test(normal)) return undefined;
  const valor = Number(normal);
  return Number.isFinite(valor) ? Math.round(valor * 100) : undefined;
}

/** Centavos no formato que a pessoa digitaria de volta: "1.500,00". */
export function textoDosCentavos(centavos: number | null): string {
  if (centavos === null) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type SituacaoDaProximaAcao = "atrasada" | "hoje" | "futura";

/**
 * Onde a próxima ação está em relação a hoje, em dias civis.
 *
 * A data é guardada como dia (meia-noite em UTC), e compará-la como instante
 * faria a ação de hoje virar atrasada às 21h de Brasília. Por isso a
 * comparação é entre os dois dias escritos, "2026-10-02" contra hoje.
 */
export function situacaoDaProximaAcao(proximaAcaoEm: string | null, hoje: string): SituacaoDaProximaAcao | null {
  if (!proximaAcaoEm) return null;
  const dia = proximaAcaoEm.slice(0, 10);
  if (dia < hoje) return "atrasada";
  if (dia === hoje) return "hoje";
  return "futura";
}

/** Os motivos mais comuns de perda, para um toque só. Ainda dá para escrever outro. */
export const MOTIVOS_DE_PERDA = [
  "Preço",
  "Sem interesse",
  "Não respondeu",
  "Comprou de outro",
  "Fora do perfil",
] as const;
