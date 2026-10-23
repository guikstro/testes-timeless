import { apiFetch } from "@/lib/api-client";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { temPresencaLocal } from "@/lib/foco";
import { inicioDaMedicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { intervaloDoMes, leIntervalo, mesAtual, periodoEquivalente } from "@/lib/periodo";
import { sessaoAtual } from "@/lib/sessao";
import { Frescor } from "@/components/ui/frescor";
import { CampanhasView } from "./campanhas-view";
import { AbasDeCampanhas } from "./abas-de-campanhas";
import type { AcoesLocais } from "./campanhas-simples";
import { CampanhasDePresencaLocal, CampanhasLocaisView } from "./campanhas-locais";
import { DesempenhoDeCampanhas } from "./tipos";
import { leMetricas, metricasDoConjunto, sugereConjunto } from "@/lib/campanhas/metricas";
import { leObjetivo } from "@/lib/campanhas/resultado";
import { anunciosPorCampanha, linhasPorResultado } from "./linhas-por-resultado";
import type { Anuncios } from "../verba/tipos";

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

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const { organization } = await sessaoAtual();

  // Sem período na URL, o mês corrente: é o que se quer ver ao abrir a tela.
  const agora = mesAtual();
  const periodo = leIntervalo(params.de, params.ate) ?? intervaloDoMes(agora.ano, agora.mes);
  const comparacao = leIntervalo(params.compararDe, params.compararAte);

  // O detalhe de cada campanha sempre compara com alguma coisa: a escolhida
  // ou, sem escolha, o período equivalente logo antes. O mês corrente conta
  // só até hoje, para não comparar 23 dias com um mês inteiro.
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const paraComparar =
    comparacao ?? periodoEquivalente({ de: periodo.de, ate: periodo.ate > hoje && periodo.de <= hoje ? hoje : periodo.ate });

  const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
  if (comparacao) {
    query.set("compararDe", comparacao.de);
    query.set("compararAte", comparacao.ate);
  }
  const consultaComparada = new URLSearchParams({
    de: periodo.de,
    ate: periodo.ate,
    compararDe: paraComparar.de,
    compararAte: paraComparar.ate,
  });

  // De quando é o gasto. Opcional: sem ele a tela continua, só sem a linha.
  const frescor = apiFetch<Frescor>("/analytics/frescor").catch(() => null);

  // Só presença local: as colunas são ligação e rota, sem nada de lead.
  if (organization.foco === "PRESENCA_LOCAL") {
    const dados = await apiFetch<CampanhasDePresencaLocal>(`/presenca-local/campanhas?${query.toString()}`);
    return <CampanhasLocaisView dados={dados} frescor={await frescor} />;
  }

  // Os dois focos: a mesma tela com duas abas, e a aba vai no endereço.
  // Quem mede leads e presença local vê uma tela só: as campanhas do Google
  // que trazem ligação e rota entram na mesma lista, com o trabalho "trazer à
  // loja". Eram duas abas, e cada uma mostrava metade das campanhas.
  const doisFocos = temPresencaLocal(organization.foco);
  const locais = doisFocos
    ? apiFetch<CampanhasDePresencaLocal>(`/presenca-local/campanhas?${consultaComparada.toString()}`).catch(() => null)
    : Promise.resolve(null);

  // Os anúncios de cada campanha, para o detalhe. Opcional: sem eles, o
  // detalhe só não lista os anúncios.
  const anuncios = apiFetch<Anuncios>(`/analytics/anuncios?de=${periodo.de}&ate=${periodo.ate}`).catch(() => null);

  const [dados, conexao, fontes] = await Promise.all([
    apiFetch<DesempenhoDeCampanhas>(`/analytics/campanhas?${consultaComparada.toString()}`),
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
  const dosLocais = await locais;
  const linhas = linhasPorResultado({
    dados,
    medido: medicao === "medido",
    comLoja: doisFocos,
    acoesLocais: acoesLocaisDe(dosLocais),
    acoesLocaisAnteriores: acoesLocaisDe(dosLocais, "anterior"),
    anuncios: anunciosPorCampanha((await anuncios)?.anuncios ?? []),
  });

  return (
    <CampanhasView
      dados={dados}
      medicao={medicao}
      desdeDoWhatsApp={conexao ? inicioDaMedicao(conexao) : null}
      frescor={fontes}
      metricas={escolhidas ?? metricasDoConjunto(sugestao.conjunto)}
      escolhaManual={escolhidas !== null}
      sugestao={sugestao}
      busca={query.toString()}
      abas={<AbasDeCampanhas ativa="desempenho" />}
      nomeDoCliente={organization.name}
      linhas={linhas}
      objetivoInicial={leObjetivo(params.objetivo)}
      comparacaoEscolhida={comparacao}
    />
  );
}

/** Ligações e rotas de cada campanha do Google, pelo id da campanha. */
function acoesLocaisDe(dados: CampanhasDePresencaLocal | null, lado: "atual" | "anterior" = "atual"): AcoesLocais | undefined {
  if (!dados) return undefined;
  return new Map(
    dados.campanhas.flatMap((linha) => {
      const numeros = linha[lado];
      return numeros ? [[linha.externalId, { ligacoes: numeros.ligacoes, rotas: numeros.rotas }] as const] : [];
    }),
  );
}
