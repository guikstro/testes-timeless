import { apiFetch } from "@/lib/api-client";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { inicioDaMedicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { intervaloDoMes, leIntervalo, mesAtual } from "@/lib/periodo";
import { sessaoAtual } from "@/lib/sessao";
import { Frescor } from "@/components/ui/frescor";
import { leMetricas, metricasDoConjunto, sugereConjunto } from "@/lib/campanhas/metricas";
import { leObjetivo } from "@/lib/campanhas/resultado";
import { OBJETIVOS_DO_NEGOCIO, PerfilDoNegocio } from "@/lib/perfil-do-negocio";
import { CampanhasView } from "./campanhas-view";
import { AbasDeCampanhas } from "./abas-de-campanhas";
import { buscaCampanhas, comparacaoDoDetalhe, montaLinhas } from "./dados-por-resultado";

export const metadata = { title: "Campanhas" };

interface Busca {
  de?: string;
  ate?: string;
  compararDe?: string;
  compararAte?: string;
  aba?: string;
  /** O filtro de objetivo: vendas, local ou audiencia. */
  objetivo?: string;
  /** As colunas da tabela, separadas por vírgula. Sem elas, vale a sugestão pelo objetivo. */
  metricas?: string;
}

/**
 * Campanhas, igual para todo cliente: quem mede leads, quem é só presença
 * local e quem tem os dois veem a mesma tela, com o resultado medido pelo
 * objetivo de cada campanha.
 */
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

  const [busca, conexao, frescor, perfil] = await Promise.all([
    buscaCampanhas({ periodo, comparacao: comparacaoDoDetalhe(periodo, comparacao), foco: organization.foco }),
    conexaoDoWhatsApp(),
    // De quando é o gasto. Opcional: sem ele a tela continua, só sem a linha.
    apiFetch<Frescor>("/analytics/frescor").catch(() => null),
    apiFetch<{ perfil: PerfilDoNegocio | null }>("/organizations/current/perfil")
      .then((r) => r.perfil)
      .catch(() => null),
  ]);
  const { dados } = busca;

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
      frescor={frescor}
      metricas={escolhidas ?? metricasDoConjunto(sugestao.conjunto)}
      escolhaManual={escolhidas !== null}
      sugestao={sugestao}
      busca={query.toString()}
      abas={<AbasDeCampanhas ativa="desempenho" />}
      nomeDoCliente={organization.name}
      linhas={montaLinhas(busca, { medido: medicao === "medido", foco: organization.foco })}
      objetivoInicial={leObjetivo(params.objetivo)}
      comparacaoEscolhida={comparacao}
      perfilDoNegocio={resumoDoPerfil(perfil)}
    />
  );
}

/** O que a análise vai saber do negócio, numa frase; null quando ninguém preencheu. */
function resumoDoPerfil(perfil: PerfilDoNegocio | null): string | null {
  if (!perfil) return null;
  const nome = (chave: string) => OBJETIVOS_DO_NEGOCIO.find((o) => o.chave === chave)?.rotulo.toLowerCase();
  const partes = [
    perfil.tipoDeNegocio,
    perfil.objetivoPrincipal ? `objetivo principal ${nome(perfil.objetivoPrincipal)}` : null,
    perfil.regiao ? `região ${perfil.regiao}` : null,
    perfil.margemPercentual !== null ? `margem de ${perfil.margemPercentual}%` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}
