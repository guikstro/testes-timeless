/** O mesmo vocabulário da API (`PerfilDoNegocio`). */
export type ObjetivoDoNegocio = "VENDAS" | "PRESENCA_LOCAL" | "AUDIENCIA";

export const OBJETIVOS_DO_NEGOCIO: { chave: ObjetivoDoNegocio; rotulo: string }[] = [
  { chave: "VENDAS", rotulo: "Vendas" },
  { chave: "PRESENCA_LOCAL", rotulo: "Presença local" },
  { chave: "AUDIENCIA", rotulo: "Audiência" },
];

export interface PerfilDoNegocio {
  tipoDeNegocio: string | null;
  oferta: string | null;
  objetivoPrincipal: ObjetivoDoNegocio | null;
  objetivosSecundarios: ObjetivoDoNegocio[];
  publico: string | null;
  regiao: string | null;
  definicaoDeSucesso: string | null;
  metaVendasPorMes: number | null;
  metaCustoPorVendaCentavos: number | null;
  metaReceitaMensalCentavos: number | null;
  cicloDeVendaDias: number | null;
  margemPercentual: number | null;
  custoMedioCentavos: number | null;
  atualizadoEm: string;
}

/**
 * "1.200,50" ou "1200.5" em centavos. Vazio é ausência (null); texto que não
 * é número também, e o formulário avisa em vez de gravar zero.
 */
export function centavosDe(texto: string): number | null | "invalido" {
  const limpo = texto.trim().replace(/^R\$\s*/i, "");
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return "invalido";
  return Math.round(Number(normal) * 100);
}

export function inteiroDe(texto: string, maximo: number): number | null | "invalido" {
  const limpo = texto.trim();
  if (!limpo) return null;
  if (!/^\d+$/.test(limpo) || Number(limpo) > maximo) return "invalido";
  return Number(limpo);
}

/** Centavos como o campo mostra: "1.200,50", sem o símbolo. */
export function textoDosCentavos(centavos: number | null): string {
  if (centavos === null) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(
    centavos / 100,
  );
}
