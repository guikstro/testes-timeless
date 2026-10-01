import { apiFetch } from "@/lib/api-client";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { temPresencaLocal } from "@/lib/foco";
import { inicioDaMedicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { intervaloDoMes, leIntervalo, mesAtual } from "@/lib/periodo";
import { sessaoAtual } from "@/lib/sessao";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { Frescor } from "@/components/ui/frescor";
import { CampanhasView } from "./campanhas-view";
import { CampanhasDePresencaLocal, CampanhasLocaisView } from "./campanhas-locais";
import { DesempenhoDeCampanhas } from "./tipos";
import { leMetricas, metricasDoConjunto, sugereConjunto } from "@/lib/campanhas/metricas";

interface Busca {
  de?: string;
  ate?: string;
  compararDe?: string;
  compararAte?: string;
  aba?: string;
  /** As colunas da tabela, separadas por vírgula. Sem elas, vale a sugestão pelo objetivo. */
  metricas?: string;
}

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const { organization } = await sessaoAtual();

  // Sem período na URL, o mês corrente: é o que se quer ver ao abrir a tela.
  const agora = mesAtual();
  const periodo = leIntervalo(params.de, params.ate) ?? intervaloDoMes(agora.ano, agora.mes);
  const comparacao = leIntervalo(params.compararDe, params.compararAte);

  const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
  if (comparacao) {
    query.set("compararDe", comparacao.de);
    query.set("compararAte", comparacao.ate);
  }

  // De quando é o gasto. Opcional: sem ele a tela continua, só sem a linha.
  const frescor = apiFetch<Frescor>("/analytics/frescor").catch(() => null);

  // Só presença local: as colunas são ligação e rota, sem nada de lead.
  if (organization.foco === "PRESENCA_LOCAL") {
    const dados = await apiFetch<CampanhasDePresencaLocal>(`/presenca-local/campanhas?${query.toString()}`);
    return <CampanhasLocaisView dados={dados} frescor={await frescor} />;
  }

  // Os dois focos: a mesma tela com duas abas, e a aba vai no endereço.
  const doisFocos = temPresencaLocal(organization.foco);
  const aba = doisFocos && params.aba === "local" ? "local" : "leads";
  const abas = doisFocos ? <AbasDoFoco ativa={aba} query={query} /> : undefined;

  if (aba === "local") {
    const dados = await apiFetch<CampanhasDePresencaLocal>(`/presenca-local/campanhas?${query.toString()}`);
    return <CampanhasLocaisView dados={dados} abas={abas} aba="local" frescor={await frescor} />;
  }

  const [dados, conexao, fontes] = await Promise.all([
    apiFetch<DesempenhoDeCampanhas>(`/analytics/campanhas?${query.toString()}`),
    conexaoDoWhatsApp(),
    frescor,
  ]);

  // Todos os leads do período, e não só os ligados a campanha: um lead sem
  // campanha também prova que o WhatsApp estava recebendo.
  const medicao = medicaoDeLeads({
    conexao,
    ate: periodo.ate,
    leads: dados.totais.leads + dados.semCampanha.atual,
  });

  // A sugestão sai das campanhas do período escolhido, pesadas pelo que
  // cada uma investiu: é o objetivo de onde o dinheiro está.
  const sugestao = sugereConjunto(
    dados.campanhas.flatMap((linha) =>
      linha.atual ? [{ objetivo: linha.objetivo, gastoCentavos: linha.atual.gastoCentavos }] : [],
    ),
  );
  const escolhidas = leMetricas(params.metricas);

  return (
    <CampanhasView
      dados={dados}
      medicao={medicao}
      desdeDoWhatsApp={conexao ? inicioDaMedicao(conexao) : null}
      abas={abas}
      frescor={fontes}
      metricas={escolhidas ?? metricasDoConjunto(sugestao.conjunto)}
      escolhaManual={escolhidas !== null}
      sugestao={sugestao}
      busca={query.toString()}
    />
  );
}

/** Leads ou presença local, no mesmo mês e com a mesma comparação. */
function AbasDoFoco({ ativa, query }: { ativa: "leads" | "local"; query: URLSearchParams }) {
  const para = (aba: "leads" | "local") => {
    const destino = new URLSearchParams(query);
    if (aba === "local") destino.set("aba", "local");
    return `/campanhas?${destino.toString()}`;
  };
  return (
    <GrupoDePilulas
      className="mb-5"
      ativo={ativa}
      opcoes={[
        { chave: "leads", rotulo: "Leads", href: para("leads") },
        { chave: "local", rotulo: "Presença local", href: para("local") },
      ]}
    />
  );
}
