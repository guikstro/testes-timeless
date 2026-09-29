import { formatCentsAsBRL } from "@/lib/currency";

/**
 * A frase que abre o relatório: o resultado do período numa linha, com no
 * máximo um trecho em destaque. Um destaque só, porque dois competem e
 * nenhum salta.
 *
 * Nunca afirma o que não foi medido: sem medida, não há frase, e o aviso da
 * tela explica o motivo. Também não liga causa e efeito que os números não
 * provam: as vendas do período podem vir de leads de antes dele, então a
 * frase diz "e", e não "vieram de".
 */
export interface FraseDeConclusao {
  antes: string;
  destaque: string | null;
  depois: string;
}

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const contagem = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`;

export function concluiRelatorioDeLeads(d: {
  medido: boolean;
  leads: number;
  vendas: number;
  receitaCentavos: number;
  investidoCentavos: number;
}): FraseDeConclusao | null {
  if (!d.medido) return null;
  if (d.vendas > 0) {
    const leads = d.leads > 0 ? ` e ${contagem(d.leads, "lead", "leads")}` : "";
    const receita = d.receitaCentavos > 0 ? `, com ${formatCentsAsBRL(d.receitaCentavos)} em vendas` : "";
    return { antes: "", destaque: contagem(d.vendas, "cliente novo", "clientes novos"), depois: `${leads} no período${receita}.` };
  }
  if (d.leads > 0) {
    const investido = d.investidoCentavos > 0 ? `, com ${formatCentsAsBRL(d.investidoCentavos)} investidos` : "";
    return { antes: "", destaque: contagem(d.leads, "lead", "leads"), depois: ` no período${investido}.` };
  }
  return { antes: "Nenhum lead no período.", destaque: null, depois: "" };
}

export function concluiRelatorioLocal(d: {
  ligacoes: number | null;
  rotas: number | null;
  investidoCentavos: number | null;
}): FraseDeConclusao | null {
  const medidas = [
    d.ligacoes === null ? null : { valor: d.ligacoes, texto: contagem(d.ligacoes, "ligação", "ligações") },
    d.rotas === null ? null : { valor: d.rotas, texto: contagem(d.rotas, "pedido de rota", "pedidos de rota") },
  ].filter((m): m is { valor: number; texto: string } => m !== null);
  if (medidas.length === 0) return null;

  const positivas = medidas.filter((m) => m.valor > 0);
  if (positivas.length === 0) {
    const nenhuma =
      medidas.length === 2
        ? "Nenhuma ligação nem pedido de rota"
        : d.ligacoes !== null
          ? "Nenhuma ligação"
          : "Nenhum pedido de rota";
    return { antes: `${nenhuma} pelos anúncios no período.`, destaque: null, depois: "" };
  }

  const investido = d.investidoCentavos ? `, com ${formatCentsAsBRL(d.investidoCentavos)} investidos` : "";
  return {
    antes: "",
    destaque: positivas.map((m) => m.texto).join(" e "),
    depois: ` pelos anúncios do Google${investido}.`,
  };
}
