import { apiFetch } from "@/lib/api-client";
import { intervaloDoMes, leIntervalo, mesAtual } from "@/lib/periodo";
import { CampanhasView } from "./campanhas-view";
import { DesempenhoDeCampanhas } from "./tipos";

interface Busca {
  de?: string;
  ate?: string;
  compararDe?: string;
  compararAte?: string;
  /** Ano que cada seletor está exibindo, que é navegação e não seleção. */
  ano?: string;
  anoCmp?: string;
}

/** Ano plausível vindo da URL. Fora da faixa, a tela volta ao ano do período. */
function leAno(valor: string | undefined): number | null {
  const ano = Number(valor);
  return Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : null;
}

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;

  // Sem período na URL, o mês corrente: é o que se quer ver ao abrir a tela.
  const agora = mesAtual();
  const periodo = leIntervalo(params.de, params.ate) ?? intervaloDoMes(agora.ano, agora.mes);
  const comparacao = leIntervalo(params.compararDe, params.compararAte);

  const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
  if (comparacao) {
    query.set("compararDe", comparacao.de);
    query.set("compararAte", comparacao.ate);
  }

  const dados = await apiFetch<DesempenhoDeCampanhas>(`/analytics/campanhas?${query.toString()}`);

  const anoDoPeriodo = Number(periodo.de.slice(0, 4));
  const ano = leAno(params.ano) ?? anoDoPeriodo;
  const anoComparacao = leAno(params.anoCmp) ?? (comparacao ? Number(comparacao.de.slice(0, 4)) : anoDoPeriodo);

  return <CampanhasView dados={dados} ano={ano} anoComparacao={anoComparacao} />;
}
