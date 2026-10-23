import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { AtualizaAoVivo } from "@/components/notifications/atualiza-ao-vivo";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { apiFetch } from "@/lib/api-client";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { medicaoDeLeads } from "@/lib/medicao-de-leads";
import { formataDia } from "@/lib/periodo";
import { ResumoSimples } from "./resumo-simples";
import { CampanhasPorResultado } from "../campanhas/campanhas-por-resultado";
import { buscaCampanhas, BuscaDeCampanhas, montaLinhas } from "../campanhas/dados-por-resultado";
import { AbaFunil } from "./aba-funil";
import { AbaOrigem } from "./aba-origem";
import { AbaAtendimento } from "./aba-atendimento";
import { Procedencia } from "./procedencia";
import { concluiAtendimento, concluiFunil, concluiOrigem, concluiPagina, concluiVisaoGeral } from "./conclusao";
import { FunilDoPeriodo, InsightsDaPagina, Overview } from "./tipos";
import { AbaPagina } from "./aba-pagina";
import { leMetricas } from "@/lib/campanhas/metricas";
import { Alert } from "@/components/ui/alert";
import { Frescor, FrescorDosDados } from "@/components/ui/frescor";
import { sessaoAtual } from "@/lib/sessao";
import { Foco, temPresencaLocal } from "@/lib/foco";
import { concluiPresencaLocal, PainelPresencaLocal, PresencaLocal } from "./painel-presenca-local";
import { FILTRO_DE_RESPONSAVEL } from "@/lib/leads/acompanhamento";

export const metadata = { title: "Resumo" };

const PERIODOS = [1, 7, 30, 90];

/** "1 dia" se lê "Hoje" na tela. */
function rotuloDoPeriodo(dias: number): string {
  return dias === 1 ? "Hoje" : `${dias} dias`;
}

/**
 * Uma pergunta por aba.
 *
 * A tela anterior empilhava oito painéis numa rolagem só, e responder
 * "quantos leads entraram" exigia passar por gráfico de horário, tabela de
 * origem e funil. Aqui cada aba responde uma coisa, e o que não é daquela
 * pergunta não aparece.
 */
const ABAS_DE_LEADS = [
  { chave: "geral", rotulo: "Resumo", conclui: concluiVisaoGeral },
  // A frase do funil sai do próprio funil, que já vem com os recortes: ver
  // `subtitulo` abaixo.
  { chave: "funil", rotulo: "Funil", conclui: () => "" },
  { chave: "origem", rotulo: "Origem", conclui: concluiOrigem },
  { chave: "atendimento", rotulo: "Atendimento", conclui: concluiAtendimento },
] as const;

/** Para quem tem os dois focos, a presença local vira mais uma aba. */
const ABA_LOCAL = { chave: "local", rotulo: "Presença local", conclui: () => "" } as const;

/** Com uma Página do Facebook escolhida em Integrações, os Insights dela viram mais uma aba. */
const ABA_PAGINA = { chave: "pagina", rotulo: "Página", conclui: () => "" } as const;

type Aba = (typeof ABAS_DE_LEADS)[number]["chave"] | "local" | "pagina";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    aba?: string;
    campanha?: string;
    origem?: string;
    responsavel?: string;
    /** As métricas dos anúncios, separadas por vírgula, como na tela de Campanhas. */
    metricas?: string;
  }>;
}) {
  const params = await searchParams;
  const days = PERIODOS.includes(Number(params.days)) ? Number(params.days) : 30;
  const { organization } = await sessaoAtual();

  // Só presença local: o painel inteiro é o do Google, sem nada de lead.
  if (organization.foco === "PRESENCA_LOCAL") return <DashboardDePresencaLocal days={days} />;

  // O frescor diz se há Página escolhida, e por isso vem antes das abas.
  const frescor = await buscaFrescor();
  const ABAS = [
    ...ABAS_DE_LEADS,
    ...(temPresencaLocal(organization.foco) ? [ABA_LOCAL] : []),
    ...(frescor?.pagina ? [ABA_PAGINA] : []),
  ];
  const aba: Aba = ABAS.some((opcao) => opcao.chave === params.aba) ? (params.aba as Aba) : "geral";
  const local = aba === "local" ? await apiFetch<PresencaLocal>(`/presenca-local?days=${days}`) : null;

  // Os recortes do funil só existem na aba dele; nas outras, a URL nem os leva.
  const recortes = aba === "funil" ? recortesDoFunil(params) : null;

  const [overview, conexao, funil, pagina] = await Promise.all([
    apiFetch<Overview>(`/analytics/overview?days=${days}`),
    conexaoDoWhatsApp(),
    recortes ? buscaFunil(days, recortes) : Promise.resolve(null),
    aba === "pagina" ? buscaPagina(days) : Promise.resolve(null),
  ]);
  // Os números da Página não dependem do WhatsApp nem de lead nenhum.
  const naPagina = aba === "pagina";
  const { totals, setup } = overview;

  const de = overview.period.from.slice(0, 10);
  const ate = overview.period.to.slice(0, 10);
  const medicao = medicaoDeLeads({ conexao, ate, leads: totals.leads });

  // Sem o WhatsApp medindo, as abas de lead não têm o que mostrar; a de
  // presença local continua, porque quem mede ligação e rota é o Google.
  const abasVisiveis =
    medicao === "medido"
      ? ABAS
      : ABAS.filter((opcao) => opcao.chave === "geral" || opcao.chave === "local" || opcao.chave === "pagina");

  // Os números dos anúncios só entram no resumo, que é onde aparecem.
  const simples = !local && !naPagina && (aba === "geral" || medicao !== "medido");
  const busca = simples ? await buscaAnuncios(de, ate, days, organization.foco) : null;
  const anuncios = busca?.dados ?? null;

  // A escolha de métricas de Campanhas vai junto ao trocar de período e de aba.
  const escolhidas = leMetricas(params.metricas);
  const comMetricas = escolhidas ? `&${new URLSearchParams({ metricas: escolhidas.join(",") }).toString()}` : "";
  const semOrigem = overview.byOrigin.find((bucket) => bucket.key === "unknown");
  const maioriaSemOrigem = totals.leads > 0 && (semOrigem?.leads ?? 0) / totals.leads >= 0.5;

  const escolhida = ABAS.find((opcao) => opcao.chave === aba)!;
  const paraAba = (destino: string) => `/dashboard?aba=${destino}&days=${days}${comMetricas}`;
  // Trocar de período dentro do funil mantém os recortes: é a mesma pergunta
  // feita sobre outra janela, e refazer os filtros seria trabalho à toa.
  const comRecortes = recortes ? new URLSearchParams(recortes).toString() : "";

  const subtitulo = local
    ? concluiPresencaLocal(local)
    : naPagina
      ? concluiPagina(pagina)
      : aba === "funil"
        ? funil
          ? concluiFunil(funil)
          : "O funil não carregou agora."
        : escolhida.conclui(overview);

  // A visão geral virou a tela simples: um número, o contexto e o que fazer
  // agora. As outras abas são o "relatório completo", um clique adiante.

  if (simples) {
    // A mesma lista que o "Responder" abre: quem espera há mais de 30 minutos,
    // em qualquer conversa, e não só entre os leads que chegaram no período.
    const espera =
      medicao === "medido"
        ? await apiFetch<{ total: number; truncado: boolean }>("/conversations?status=awaiting").catch(() => null)
        : null;
    const comLocal = temPresencaLocal(organization.foco);
    return (
      <div className="mx-auto max-w-6xl">
        <AtualizaAoVivo />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-corpo text-ink-mute">
            {days === 1 ? `Hoje, ${formataDia(ate)}` : `Últimos ${days} dias, de ${formataDia(de)} a ${formataDia(ate)}`}
            {comLocal ? (
              <>
                {"  "}
                <Link href={paraAba("local")} className="ml-3 font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
                  Ver presença local
                </Link>
              </>
            ) : null}
          </p>
          <GrupoDePilulas
            ativo={String(days)}
            opcoes={PERIODOS.map((opcao) => ({
              chave: String(opcao),
              rotulo: rotuloDoPeriodo(opcao),
              href: `/dashboard?days=${opcao}${comMetricas}`,
            }))}
          />
        </header>
        {medicao === "medido" ? (
          <ResumoSimples
            overview={overview}
            gastoCentavos={anuncios?.totais.gastoCentavos ?? null}
            esperando={espera ? { quantos: espera.total, mais: espera.truncado } : null}
            dias={days}
            relatorioCompleto={paraAba("funil")}
          />
        ) : (
          /*
            Sem WhatsApp recebendo não há lead para contar, mas o dinheiro dos
            anúncios continua sendo gasto: o resumo mostra o que ele comprou, no
            mesmo desenho de Campanhas, sem explicar a conexão: quem conectou
            sabe o que conectou.
          */
          <div className="mt-8">
            {busca ? (
              <>
                {/* A mesma lista de Campanhas, com o mesmo detalhe: um desenho só no sistema inteiro. */}
                <CampanhasPorResultado
                  linhas={montaLinhas(busca, { medido: false, foco: organization.foco })}
                  objetivoInicial={null}
                  medido={false}
                  rotuloDoPeriodo={days === 1 ? "hoje" : `os últimos ${days} dias`}
                  rotuloDaComparacao={days === 1 ? "ontem" : `os ${days} dias anteriores`}
                />
                <Link href="/campanhas" className="mt-4 inline-flex text-corpo font-medium text-accent underline underline-offset-2">
                  Ver todas as campanhas
                </Link>
              </>
            ) : (
              <p className="py-10 text-center text-destaque text-ink-mute">Nenhum gasto em anúncios neste período.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <AtualizaAoVivo />

      {/*
        Um cabeçalho só, igual em todas as abas: a pergunta muda, o lugar de
        trocar de período e de aba não.
      */}
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-apoio font-medium text-ink-mute">
              {formataDia(overview.period.from.slice(0, 10))} a {formataDia(overview.period.to.slice(0, 10))}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
              {escolhida.rotulo}
            </h1>
            {/*
              O subtítulo conclui, não pergunta.

              Ele era a pergunta que a aba responde ("Quanto entrou, e
              melhorou?"), e uma pergunta na abertura obriga a ler a tela
              inteira para chegar a uma resposta que já cabia na primeira
              linha. O título diz o assunto; esta linha diz o que aconteceu.
            */}
            <p className="mt-0.5 text-corpo text-ink-mute">{subtitulo}</p>
            <FrescorDosDados
              frescor={frescor}
              fontes={local ? ["google"] : naPagina ? ["pagina"] : ["meta", "google"]}
              aoVivo={!local && !naPagina && medicao === "medido"}
              className="mt-2"
            />
          </div>

          <GrupoDePilulas
            ativo={String(days)}
            opcoes={PERIODOS.map((opcao) => ({
              chave: String(opcao),
              rotulo: rotuloDoPeriodo(opcao),
              href: `/dashboard?aba=${aba}&days=${opcao}${comRecortes ? `&${comRecortes}` : ""}${comMetricas}`,
            }))}
          />
        </div>

        {abasVisiveis.length > 1 ? (
          <nav className="mt-5 flex gap-1 border-b border-line" aria-label="Seções do dashboard">
            {abasVisiveis.map((opcao) => {
              const ativa = opcao.chave === aba;
              return (
                <Link
                  key={opcao.chave}
                  href={paraAba(opcao.chave)}
                  aria-current={ativa ? "page" : undefined}
                  /* Sublinhado e não pílula: a aba pertence ao cabeçalho e
                     precisa parecer parte dele, não um controle solto. */
                  className={`focus-ring relative -mb-px rounded-t-lg px-3.5 py-2.5 text-corpo font-medium transition-colors duration-200 ease-soft ${
                    ativa ? "text-ink" : "text-ink-mute hover:text-ink-soft"
                  }`}
                >
                  {opcao.rotulo}
                  {ativa ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      {local ? <PainelPresencaLocal dados={local} campanhas={await listaLocal(local, days, organization.foco)} /> : null}

      {naPagina ? (
        pagina ? (
          <AbaPagina dados={pagina} dias={days} />
        ) : (
          <Alert tom="warning" titulo="Não foi possível carregar os números da Página agora">
            As outras abas continuam funcionando. Tente de novo em alguns instantes.
          </Alert>
        )
      ) : null}

      {medicao === "medido" && aba === "funil" ? (
        funil ? (
          <AbaFunil dados={funil} />
        ) : (
          <Alert tom="warning" titulo="Não foi possível carregar o funil agora">
            As outras abas continuam funcionando. Tente de novo em alguns instantes.
          </Alert>
        )
      ) : null}
      {medicao === "medido" && aba === "origem" ? <AbaOrigem overview={overview} /> : null}
      {medicao === "medido" && aba === "atendimento" ? <AbaAtendimento overview={overview} /> : null}

      {/*
        O alerta continua sendo para quando está ruim de verdade.

        A cobertura em si passou a ser dita sempre, no rodapé de procedência:
        com um limiar de metade, 49% sem origem não mostrava nada e quem lia a
        aba de origem acreditava estar vendo o quadro inteiro. O alerta aqui
        acrescenta o que fazer a respeito, que é outra coisa, e por isso ele
        continua condicionado.
      */}
      {!local && !naPagina && medicao === "medido" && maioriaSemOrigem ? (
        <Alert tom="warning" className="mt-6" titulo="A maior parte dos leads está sem origem identificada.">
          <p>
            A origem só é registrada quando a pessoa chega por um anúncio Click-to-WhatsApp ou por um link
            rastreável. Quem manda mensagem direto para o número não carrega essa evidência, e ela nunca é deduzida
            por aproximação.
          </p>
          {setup.trackingLinkCount === 0 ? (
            <p className="mt-2">
              <Link href="/links" className="underline">Crie um link rastreável</Link> para usar na bio e nas campanhas.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {!local && !naPagina && medicao === "medido" ? <Procedencia overview={overview} /> : null}
    </div>
  );
}

/** O dashboard de quem é só presença local: cabeçalho com período e o painel do Google. */
async function DashboardDePresencaLocal({ days }: { days: number }) {
  const [dados, frescor] = await Promise.all([apiFetch<PresencaLocal>(`/presenca-local?days=${days}`), buscaFrescor()]);
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-apoio font-medium text-ink-mute">
            {formataDia(dados.periodo.de)} a {formataDia(dados.periodo.ate)}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Presença local</h1>
          <p className="mt-0.5 text-corpo text-ink-mute">{concluiPresencaLocal(dados)}</p>
          <FrescorDosDados frescor={frescor} fontes={["google"]} className="mt-2" />
        </div>
        <GrupoDePilulas
          ativo={String(days)}
          opcoes={PERIODOS.map((opcao) => ({ chave: String(opcao), rotulo: rotuloDoPeriodo(opcao), href: `/dashboard?days=${opcao}` }))}
        />
      </header>
      <PainelPresencaLocal dados={dados} campanhas={await listaLocal(dados, days, "PRESENCA_LOCAL")} />
    </div>
  );
}

/**
 * Os recortes do funil que vieram pela URL, conferidos.
 *
 * Texto de fora, que não merece confiança: um valor que a API recusaria vira
 * ausência de recorte aqui, em vez de derrubar a aba por causa de um link
 * mal copiado.
 */
function recortesDoFunil(params: { campanha?: string; origem?: string; responsavel?: string }): Record<string, string> {
  const recortes: Record<string, string> = {};
  const campanha = params.campanha?.trim();
  const origem = params.origem?.trim();
  if (campanha && campanha.length <= 200) recortes.campanha = campanha;
  if (origem && origem.length <= 300) recortes.origem = origem;
  if (params.responsavel && FILTRO_DE_RESPONSAVEL.test(params.responsavel)) recortes.responsavel = params.responsavel;
  return recortes;
}

/**
 * O funil com os recortes, ou null quando a consulta falha.
 *
 * Só esta aba depende dele, então uma falha aqui vira um aviso dentro dela e
 * o resto do painel continua. O redirecionamento de sessão encerrada passa
 * adiante (`unstable_rethrow`), ou a pessoa ficaria presa numa tela sem dados.
 */
async function buscaFunil(days: number, recortes: Record<string, string>): Promise<FunilDoPeriodo | null> {
  const consulta = new URLSearchParams({ days: String(days), ...recortes });
  try {
    return await apiFetch<FunilDoPeriodo>(`/analytics/funil?${consulta.toString()}`);
  } catch (erro) {
    unstable_rethrow(erro);
    return null;
  }
}

/**
 * Os números dos anúncios no período e no anterior do mesmo tamanho, colado
 * nele, ou null quando a consulta falha: sem eles a seção some, e o resto do
 * painel continua. A sessão encerrada passa adiante (`unstable_rethrow`).
 */
async function buscaAnuncios(de: string, ate: string, days: number, foco: Foco): Promise<BuscaDeCampanhas | null> {
  const dia = (base: string, deslocamento: number) =>
    new Date(Date.parse(`${base}T12:00:00.000Z`) + deslocamento * 86_400_000).toISOString().slice(0, 10);
  try {
    return await buscaCampanhas({ periodo: { de, ate }, comparacao: { de: dia(de, -days), ate: dia(de, -1) }, foco });
  } catch (erro) {
    unstable_rethrow(erro);
    return null;
  }
}

/**
 * Os Insights da Página, ou null quando a consulta falha: só esta aba depende
 * deles, e uma falha aqui vira um aviso dentro dela. A sessão encerrada passa
 * adiante (`unstable_rethrow`).
 */
async function buscaPagina(days: number): Promise<InsightsDaPagina | null> {
  try {
    return await apiFetch<InsightsDaPagina>(`/analytics/pagina?days=${days}`);
  } catch (erro) {
    unstable_rethrow(erro);
    return null;
  }
}

/** De quando é o dado. Opcional: sem ele a tela continua, só sem a linha. */
function buscaFrescor(): Promise<Frescor | null> {
  return apiFetch<Frescor>("/analytics/frescor").catch(() => null);
}

/**
 * As campanhas de presença local na lista padrão, no mesmo período do painel.
 * Se a consulta falhar, o painel mostra a própria tabela, como antes.
 */
async function listaLocal(dados: PresencaLocal, days: number, foco: Foco) {
  const anterior = dados.periodoAnterior ?? null;
  if (!anterior) return undefined;
  try {
    const busca = await buscaCampanhas({ periodo: dados.periodo, comparacao: anterior, foco });
    const linhas = montaLinhas(busca, { medido: false, foco }).filter((l) => l.objetivo === "local");
    return (
      <CampanhasPorResultado
        linhas={linhas}
        objetivoInicial={null}
        medido={false}
        rotuloDoPeriodo={days === 1 ? "hoje" : `os últimos ${days} dias`}
        rotuloDaComparacao={days === 1 ? "ontem" : `os ${days} dias anteriores`}
      />
    );
  } catch (erro) {
    unstable_rethrow(erro);
    return undefined;
  }
}
