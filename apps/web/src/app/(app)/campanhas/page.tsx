import { apiFetch } from "@/lib/api-client";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { inicioDaMedicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { intervaloDoMes, leIntervalo, mesAtual } from "@/lib/periodo";
import { CampanhasView } from "./campanhas-view";
import { DesempenhoDeCampanhas } from "./tipos";

interface Busca {
  de?: string;
  ate?: string;
  compararDe?: string;
  compararAte?: string;
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

  const [dados, conexao] = await Promise.all([
    apiFetch<DesempenhoDeCampanhas>(`/analytics/campanhas?${query.toString()}`),
    conexaoDoWhatsApp(),
  ]);

  // Todos os leads do período, e não só os ligados a campanha: um lead sem
  // campanha também prova que o WhatsApp estava recebendo.
  const medicao = medicaoDeLeads({
    conexao,
    ate: periodo.ate,
    leads: dados.totais.leads + dados.semCampanha.atual,
  });

  return (
    <CampanhasView
      dados={dados}
      medicao={medicao}
      desdeDoWhatsApp={conexao ? inicioDaMedicao(conexao) : null}
    />
  );
}
