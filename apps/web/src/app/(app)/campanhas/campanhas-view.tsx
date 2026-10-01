import { ReactNode } from "react";
import Link from "next/link";
import { AvisoDeMedicao } from "@/components/aviso-de-medicao";
import { Badge } from "@/components/ui/badge";
import { Delta } from "@/components/ui/delta";
import { Frescor, FrescorDosDados } from "@/components/ui/frescor";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { formatCentsAsBRL } from "@/lib/currency";
import { Medicao } from "@/lib/medicao-de-leads";
import {
  formataDia,
  Intervalo,
  intervaloDoMes,
  MESES_CURTOS,
  mesAnterior,
  mesDoIntervalo,
  rotuloDoIntervalo,
} from "@/lib/periodo";
import {
  alterna,
  Conjunto,
  CONJUNTOS,
  conjuntoDe,
  DEFINICAO,
  formataTaxa,
  Metrica,
  METRICAS,
  metricasDoConjunto,
  rotuloDoObjetivo,
} from "@/lib/campanhas/metricas";
import { CampanhaComparada, DesempenhoDeCampanha, DesempenhoDeCampanhas } from "./tipos";

/**
 * Separado da página pelo mesmo motivo da tela de relatório: a página busca no
 * servidor, esta vista só desenha, e assim a apresentação pode ser conferida
 * sem depender de dados reais.
 *
 * A tela responde uma pergunta só: de cada campanha, quanto saiu e quanto
 * voltou. Por isso a ordem das colunas segue o caminho do dinheiro, do gasto
 * à conversa que a Meta abriu, ao lead que chegou aqui, à venda.
 */
export function CampanhasView({
  dados,
  medicao,
  desdeDoWhatsApp,
  abas,
  frescor = null,
  metricas = metricasDoConjunto("vendas"),
  escolhaManual = false,
  sugestao = { conjunto: "vendas", objetivo: null },
  busca = "",
}: {
  dados: DesempenhoDeCampanhas;
  medicao: Medicao;
  desdeDoWhatsApp: string | null;
  /** Leads e presença local, para quem tem os dois focos. */
  abas?: ReactNode;
  /** De quando é o gasto que chegou da Meta e do Google. */
  frescor?: Frescor | null;
  /** As colunas da tabela, na ordem do catálogo. */
  metricas?: Metrica[];
  /** Falso quando as métricas vieram da sugestão pelo objetivo, e não de uma escolha. */
  escolhaManual?: boolean;
  sugestao?: { conjunto: Conjunto; objetivo: string | null };
  /** O período da URL, sem as métricas, para os links da escolha não o perderem. */
  busca?: string;
}) {
  const { periodo, comparacao, campanhas, semCampanha, totais } = dados;
  const medido = medicao === "medido";

  // Os totais do período de comparação saem das próprias linhas: a API já
  // devolve os dois lados de cada campanha, e somá-los aqui evita uma segunda
  // rota que diria a mesma coisa.
  const anteriores = comparacao ? somaAnteriores(campanhas) : null;

  /*
    Campanha criada à mão sem o id real da plataforma nunca casa com lead
    nenhum: o cruzamento usa o id que vem no clique. Sem este aviso, a linha
    com gasto e zero leads é lida como "a campanha não converte", quando o
    problema é de configuração.
  */
  const semIdDaPlataforma = campanhas.filter(
    (linha) =>
      linha.externalId.startsWith("manual:") &&
      linha.atual !== null &&
      linha.atual.gastoCentavos > 0 &&
      linha.atual.leads === 0,
  ).length;

  // O investimento abre sempre; os outros quatro cartões seguem a escolha.
  const cartoes = metricas.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl">
      {abas}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Campanhas</h1>
          <p className="mt-1 max-w-2xl text-corpo text-ink-mute">
            Quanto cada campanha custou e o que trouxe: da impressão e do clique na Meta até o lead e a venda aqui.
          </p>
          <FrescorDosDados frescor={frescor} className="mt-2" />
        </div>
        <SeletorDePeriodo
          periodo={periodo}
          comparacao={comparacao}
          metricas={escolhaManual ? metricas.join(",") : undefined}
        />
      </header>

      <AvisoDeMedicao medicao={medicao} desde={desdeDoWhatsApp} conversasNaPlataforma={totais.conversasNaPlataforma} />

      <SeletorDeMetricas metricas={metricas} escolhaManual={escolhaManual} sugestao={sugestao} busca={busca} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Resumo
          titulo="Investimento"
          valor={formatCentsAsBRL(totais.gastoCentavos)}
          atual={totais.gastoCentavos}
          anterior={anteriores?.gastoCentavos}
        />
        {cartoes.map((metrica) => (
          <Resumo key={metrica} {...resumoDaMetrica(metrica, totais, anteriores, medido)} />
        ))}
      </div>

      {campanhas.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-corpo text-ink-soft">Nenhuma campanha com gasto ou lead em {rotuloDoIntervalo(periodo)}.</p>
          <p className="mt-1.5 text-apoio text-ink-mute">
            Conecte a Meta em Integrações, ou lance o gasto por CSV ou à mão, para as campanhas aparecerem aqui.
          </p>
        </div>
      ) : (
        <Tabela
          campanhas={campanhas}
          metricas={metricas}
          medido={medido}
          rotuloDaComparacao={comparacao ? rotuloDoIntervalo(comparacao) : null}
        />
      )}

      {/*
        As definições ficam ao pé da tabela, uma vez só, em vez de repetidas em
        cada cabeçalho: é a primeira coisa que alguém procura quando dois
        números parecidos não batem. Só as das colunas à vista.
      */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 text-apoio leading-relaxed text-ink-mute md:grid-cols-3">
        {metricas.map((metrica) => (
          <div key={metrica}>
            <dt className="font-semibold text-ink-soft">{DEFINICAO[metrica].rotulo}</dt>
            <dd>{DEFINICAO[metrica].definicao}</dd>
          </div>
        ))}
      </dl>

      {/*
        A soma das linhas não fecha com o total de leads da organização, e uma
        tabela que não diz isso passa a impressão de que as campanhas respondem
        por tudo o que entra.
      */}
      {medido && semCampanha.atual > 0 ? (
        <p className="mt-4 text-apoio leading-relaxed text-ink-mute">
          Mais {semCampanha.atual} {semCampanha.atual === 1 ? "lead entrou" : "leads entraram"} no período sem campanha
          identificada, por mensagem direta ou por clique sem rastreio.{" "}
          {semCampanha.atual === 1 ? "Ele não entra" : "Eles não entram"} em nenhuma linha acima.
        </p>
      ) : null}

      {semIdDaPlataforma > 0 && (
        <p className="mt-2 text-apoio leading-relaxed text-ink-mute">
          {semIdDaPlataforma === 1 ? "Uma campanha aparece" : `${semIdDaPlataforma} campanhas aparecem`} com gasto e
          nenhum lead porque {semIdDaPlataforma === 1 ? "foi criada" : "foram criadas"} sem o id da plataforma. O lead
          é ligado à campanha pelo id que chega no clique, então preencha o id real do Google Ads ou do Meta ao criar a
          campanha, e use links de rastreio que carreguem esse id.
        </p>
      )}
    </div>
  );
}

interface Anteriores {
  gastoCentavos: number;
  leads: number;
  vendas: number;
  /** Undefined quando nenhuma campanha do período de comparação trouxe o número. */
  impressoes?: number;
  cliques?: number;
}

function somaAnteriores(campanhas: CampanhaComparada[]): Anteriores {
  const soma = (valor: (linha: DesempenhoDeCampanha) => number | null) => {
    const conhecidos = campanhas
      .map((linha) => (linha.anterior ? valor(linha.anterior) : null))
      .filter((numero): numero is number => numero !== null);
    return conhecidos.length > 0 ? conhecidos.reduce((total, numero) => total + numero, 0) : undefined;
  };
  return {
    gastoCentavos: soma((linha) => linha.gastoCentavos) ?? 0,
    leads: soma((linha) => linha.leads) ?? 0,
    vendas: soma((linha) => linha.vendas) ?? 0,
    impressoes: soma((linha) => linha.impressoes),
    cliques: soma((linha) => linha.cliques),
  };
}

const SEM_DADO = "Sem dado";
const SEM_MEDIDA = "Sem medida";

/** O cartão do total de uma métrica. */
function resumoDaMetrica(
  metrica: Metrica,
  totais: DesempenhoDeCampanhas["totais"],
  anteriores: Anteriores | null,
  medido: boolean,
): { titulo: string; valor: string; atual?: number; anterior?: number; nota?: string; apagado?: boolean; invertido?: boolean } {
  const titulo = DEFINICAO[metrica].rotulo;
  const dinheiro = (centavos: number | null) => (centavos === null ? SEM_DADO : formatCentsAsBRL(centavos));
  const piso = !totais.entregaCompleta && totais.impressoes !== null ? "No mínimo: falta dado de alguns dias" : undefined;

  switch (metrica) {
    case "impressoes":
      return {
        titulo,
        valor: totais.impressoes === null ? SEM_DADO : totais.impressoes.toLocaleString("pt-BR"),
        atual: totais.impressoes ?? undefined,
        anterior: totais.impressoes === null ? undefined : anteriores?.impressoes,
        apagado: totais.impressoes === null,
        nota: piso,
      };
    case "cliques":
      return {
        titulo,
        valor: totais.cliques === null ? SEM_DADO : totais.cliques.toLocaleString("pt-BR"),
        atual: totais.cliques ?? undefined,
        anterior: totais.cliques === null ? undefined : anteriores?.cliques,
        apagado: totais.cliques === null,
        nota: piso,
      };
    case "cpm":
      return { titulo, valor: dinheiro(totais.cpmCentavos), apagado: totais.cpmCentavos === null, nota: "A cada mil impressões" };
    case "ctr":
      return {
        titulo,
        valor: totais.ctr === null ? SEM_DADO : formataTaxa(totais.ctr),
        apagado: totais.ctr === null,
        nota: "Cliques por impressão",
      };
    case "cpc":
      return { titulo, valor: dinheiro(totais.cpcCentavos), apagado: totais.cpcCentavos === null, nota: "Por clique" };
    case "conversas":
      return {
        titulo,
        valor: totais.conversasNaPlataforma === null ? SEM_DADO : String(totais.conversasNaPlataforma),
        apagado: totais.conversasNaPlataforma === null,
        nota: "O que o Gerenciador de Anúncios conta",
      };
    case "custoPorConversa":
      return {
        titulo,
        valor: dinheiro(totais.custoPorConversaCentavos),
        apagado: totais.custoPorConversaCentavos === null,
      };
    case "leads":
      return {
        titulo,
        valor: medido ? String(totais.leads) : SEM_MEDIDA,
        atual: medido ? totais.leads : undefined,
        anterior: medido ? anteriores?.leads : undefined,
        apagado: !medido,
      };
    case "custoPorLead":
      return {
        titulo,
        valor: !medido
          ? SEM_MEDIDA
          : totais.gastoCentavos <= 0
            ? "Sem gasto"
            : totais.leads === 0
              ? "Nenhum lead"
              : formatCentsAsBRL(Math.round(totais.gastoCentavos / totais.leads)),
        apagado: !medido || totais.gastoCentavos <= 0 || totais.leads === 0,
      };
    case "vendas":
      return {
        titulo,
        valor: medido ? String(totais.vendas) : SEM_MEDIDA,
        atual: medido ? totais.vendas : undefined,
        anterior: medido ? anteriores?.vendas : undefined,
        apagado: !medido,
      };
    case "receita":
      return { titulo, valor: medido ? formatCentsAsBRL(totais.receitaCentavos) : SEM_MEDIDA, apagado: !medido };
    case "retorno":
      return {
        titulo,
        valor: medido ? retorno(totais.receitaCentavos, totais.gastoCentavos, totais.vendas) : SEM_MEDIDA,
        nota: medido && totais.gastoCentavos > 0 ? "Receita dividida pelo investimento" : undefined,
        apagado: !medido,
      };
  }
}

/**
 * A escolha das colunas.
 *
 * Em links, e não em estado do navegador: a escolha vai junto quando o
 * endereço é compartilhado, e a tela continua desenhada no servidor. Os
 * conjuntos prontos resolvem o caso comum num clique; as métricas soltas, o
 * resto.
 */
function SeletorDeMetricas({
  metricas,
  escolhaManual,
  sugestao,
  busca,
}: {
  metricas: Metrica[];
  escolhaManual: boolean;
  sugestao: { conjunto: Conjunto; objetivo: string | null };
  busca: string;
}) {
  const href = (lista: Metrica[] | null) => {
    const params = new URLSearchParams(busca);
    if (lista) params.set("metricas", lista.join(","));
    else params.delete("metricas");
    return `/campanhas?${params.toString()}`;
  };

  const conjuntos: Conjunto[] = ["entrega", "conversas", "vendas", "todas"];
  const ativo = escolhaManual ? conjuntoDe(metricas) : "sugeridas";

  return (
    <section aria-label="Métricas da tabela" className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Métricas</p>
        <GrupoDePilulas
          ativo={ativo}
          opcoes={[
            {
              chave: "sugeridas",
              rotulo: sugestao.objetivo ? `Pelo objetivo: ${sugestao.objetivo}` : "Sugeridas",
              href: href(null),
              titulo: sugestao.objetivo
                ? `A maior parte do investimento está em campanhas de ${sugestao.objetivo.toLowerCase()}.`
                : "Sem objetivo informado pela plataforma, ficam as métricas de resultado.",
            },
            ...conjuntos.map((conjunto) => ({
              chave: conjunto,
              rotulo: CONJUNTOS[conjunto].rotulo,
              href: href(metricasDoConjunto(conjunto)),
            })),
          ]}
        />
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label="Escolher as métricas uma a uma">
        {METRICAS.map((metrica) => {
          const ligada = metricas.includes(metrica.chave);
          return (
            <li key={metrica.chave}>
              <Link
                href={href(alterna(metricas, metrica.chave))}
                scroll={false}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-apoio transition-all duration-200 ease-soft active:scale-95 ${
                  ligada
                    ? "bg-accent/15 font-medium text-ink ring-1 ring-inset ring-accent/50"
                    : "border border-line bg-panel text-ink-mute hover:border-ink/20 hover:text-ink"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden
                >
                  {ligada ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}
                </svg>
                {metrica.rotulo}
                <span className="sr-only">{ligada ? ", mostrando" : ", escondida"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Retorno escrito, e não só a conta.
 *
 * "0,00x" com nenhuma venda é aritmeticamente certo e ninguém entende; dizer
 * que não houve venda é o mesmo fato em português.
 */
function retorno(receitaCentavos: number, gastoCentavos: number, vendas: number): string {
  if (gastoCentavos <= 0) return "Sem gasto";
  if (vendas === 0) return "Nenhuma venda";
  return `${(receitaCentavos / gastoCentavos).toFixed(2).replace(".", ",")}x`;
}

/**
 * O período numa linha só.
 *
 * Eram dois calendários de doze meses lado a lado, ocupando meia tela antes
 * do primeiro número. Quase toda consulta é "este mês" ou "o mês passado", e
 * quase toda comparação é contra o mês anterior ou o mesmo mês do ano
 * anterior: as setas e três opções cobrem isso sem grade nenhuma.
 */
export function SeletorDePeriodo({
  periodo,
  comparacao,
  aba,
  metricas,
}: {
  periodo: Intervalo;
  comparacao: Intervalo | null;
  /** A aba da tela, que a troca de mês não pode perder. */
  aba?: string;
  /** As métricas escolhidas, que a troca de mês também não pode perder. */
  metricas?: string;
}) {
  const mes = mesDoIntervalo(periodo) ?? {
    ano: Number(periodo.de.slice(0, 4)),
    mes: Number(periodo.de.slice(5, 7)),
  };
  const anterior = mesAnterior(mes.ano, mes.mes);
  const seguinte = mes.mes === 12 ? { ano: mes.ano + 1, mes: 1 } : { ano: mes.ano, mes: mes.mes + 1 };

  const mesPassado = intervaloDoMes(anterior.ano, anterior.mes);
  const anoPassado = intervaloDoMes(mes.ano - 1, mes.mes);

  function url(p: Intervalo, c: Intervalo | null) {
    const params = new URLSearchParams({ de: p.de, ate: p.ate });
    if (aba) params.set("aba", aba);
    if (metricas) params.set("metricas", metricas);
    if (c) {
      params.set("compararDe", c.de);
      params.set("compararAte", c.ate);
    }
    return `/campanhas?${params.toString()}`;
  }

  // Ao trocar de mês a comparação acompanha: "contra o mês anterior" continua
  // querendo dizer o anterior ao novo, e não o anterior ao antigo.
  function comparacaoPara(novo: { ano: number; mes: number }): Intervalo | null {
    if (!comparacao) return null;
    if (igual(comparacao, anoPassado)) return intervaloDoMes(novo.ano - 1, novo.mes);
    const antesDoNovo = mesAnterior(novo.ano, novo.mes);
    return intervaloDoMes(antesDoNovo.ano, antesDoNovo.mes);
  }

  const ativo = !comparacao
    ? "nenhuma"
    : igual(comparacao, mesPassado)
      ? "mes"
      : igual(comparacao, anoPassado)
        ? "ano"
        : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="surface flex items-center gap-1 rounded-full p-1">
        <SetaDeMes href={url(intervaloDoMes(anterior.ano, anterior.mes), comparacaoPara(anterior))} direcao="anterior" />
        <span className="min-w-[10.5rem] px-2 text-center text-corpo font-medium text-ink">
          {rotuloDoIntervalo(periodo)}
        </span>
        <SetaDeMes href={url(intervaloDoMes(seguinte.ano, seguinte.mes), comparacaoPara(seguinte))} direcao="proximo" />
      </div>

      <GrupoDePilulas
        ativo={ativo}
        opcoes={[
          { chave: "nenhuma", rotulo: "Sem comparar", href: url(periodo, null) },
          { chave: "mes", rotulo: "Mês anterior", href: url(periodo, mesPassado) },
          { chave: "ano", rotulo: `${MESES_CURTOS[mes.mes - 1]} de ${mes.ano - 1}`, href: url(periodo, anoPassado) },
        ]}
      />
    </div>
  );
}

function igual(a: Intervalo, b: Intervalo): boolean {
  return a.de === b.de && a.ate === b.ate;
}

function SetaDeMes({ href, direcao }: { href: string; direcao: "anterior" | "proximo" }) {
  return (
    <Link
      href={href}
      aria-label={direcao === "anterior" ? "Mês anterior" : "Mês seguinte"}
      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-mute transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        {direcao === "anterior" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </Link>
  );
}

export function Resumo({
  titulo,
  valor,
  atual,
  anterior,
  nota,
  apagado = false,
  invertido = false,
}: {
  titulo: string;
  valor: string;
  atual?: number;
  /** Ausente quando não há período de comparação escolhido. */
  anterior?: number;
  nota?: string;
  /** Sem medida: o valor é escrito, mas não pode parecer um número. */
  apagado?: boolean;
  /** Para custo: subir é ruim. */
  invertido?: boolean;
}) {
  const compara = anterior !== undefined && atual !== undefined;

  return (
    <div className="surface p-4">
      <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</p>
      <p
        className={`mt-1.5 font-display font-semibold tabular-nums ${
          apagado ? "text-lg text-ink-mute" : "text-xl text-ink"
        }`}
      >
        {valor}
      </p>
      {compara && (
        <div className="mt-1">
          <Delta delta={anterior === 0 ? null : (atual - anterior) / anterior} invertido={invertido} />
        </div>
      )}
      {nota && <p className="mt-1 text-rotulo text-ink-mute">{nota}</p>}
    </div>
  );
}

const PLATAFORMAS: Record<string, string> = { GOOGLE: "Google Ads", META: "Meta Ads" };

export const STATUS: Record<string, { rotulo: string; tom: "success" | "neutral" }> = {
  ACTIVE: { rotulo: "Ativa", tom: "success" },
  PAUSED: { rotulo: "Pausada", tom: "neutral" },
  ARCHIVED: { rotulo: "Arquivada", tom: "neutral" },
  DELETED: { rotulo: "Excluída", tom: "neutral" },
};

/** Largura mínima pelo número de colunas: quem rola é a tabela, nunca a página. */
function larguraMinima(colunas: number): string {
  if (colunas <= 4) return "min-w-[40rem]";
  if (colunas <= 7) return "min-w-[60rem]";
  return "min-w-[80rem]";
}

function Tabela({
  campanhas,
  metricas,
  medido,
  rotuloDaComparacao,
}: {
  campanhas: CampanhaComparada[];
  metricas: Metrica[];
  medido: boolean;
  /** Null quando nenhum período de comparação foi escolhido. */
  rotuloDaComparacao: string | null;
}) {
  return (
    <div className="surface overflow-hidden">
      {/* A tabela é larga de propósito; quem rola é ela, nunca a página. */}
      <div className="overflow-x-auto">
        <table className={`w-full ${larguraMinima(metricas.length)} text-corpo`}>
          <thead>
            <tr className="border-b border-line text-left text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
              <th className="px-4 py-3 font-semibold">Campanha</th>
              <th className="px-4 py-3 text-right font-semibold">Investimento</th>
              {metricas.map((metrica) => (
                <th key={metrica} className="px-4 py-3 text-right font-semibold">
                  {DEFINICAO[metrica].rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campanhas.map((linha) => (
              <Linha
                key={linha.externalId}
                linha={linha}
                metricas={metricas}
                medido={medido}
                rotuloDaComparacao={rotuloDaComparacao}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Linha({
  linha,
  metricas,
  medido,
  rotuloDaComparacao,
}: {
  linha: CampanhaComparada;
  metricas: Metrica[];
  medido: boolean;
  rotuloDaComparacao: string | null;
}) {
  // Uma campanha ausente do período escolhido continua na tabela: "não rodou"
  // é metade da explicação de uma queda, e some-la esconderia justamente isso.
  const ausente = linha.atual === null;
  const dados = linha.atual ?? linha.anterior!;
  const temComparacao = rotuloDaComparacao !== null;
  const status = STATUS[linha.status];
  const objetivo = rotuloDoObjetivo(linha.objetivo);

  // As colunas que dependem do WhatsApp vêm juntas no fim (é a ordem do
  // catálogo), então sem medida elas viram uma célula só.
  const daPlataforma = metricas.filter((metrica) => DEFINICAO[metrica].daPlataforma);
  const doWhatsApp = metricas.filter((metrica) => !DEFINICAO[metrica].daPlataforma);

  return (
    <tr className={`border-b border-line/60 last:border-0 ${ausente ? "opacity-55" : ""}`}>
      <td className="px-4 py-3.5 align-top">
        <p className="font-medium text-ink">{linha.nome}</p>
        {/*
          Status e data de criação logo abaixo do nome: a Meta aceita duas
          campanhas com o mesmo nome, e é comum duplicar uma para testar. Sem
          isto, as duas linhas pareciam a mesma campanha repetida.
        */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-rotulo text-ink-mute">
          {status ? (
            <Badge tone={status.tom} dot>
              {status.rotulo}
            </Badge>
          ) : null}
          <span>{PLATAFORMAS[linha.plataforma] ?? linha.plataforma}</span>
          {/* O objetivo diz por qual número a campanha deve ser julgada. */}
          {objetivo ? <span>· {objetivo}</span> : null}
          {linha.criadaNaPlataformaEm ? <span>· criada em {formataDia(linha.criadaNaPlataformaEm)}</span> : null}
        </div>
        {dados.ativo && (
          <p className="mt-1 text-rotulo text-ink-mute">
            {dados.ativo.dias === 1
              ? `Gasto em 1 dia (${formataDia(dados.ativo.de)})`
              : `Gasto em ${dados.ativo.dias} dias, de ${formataDia(dados.ativo.de)} a ${formataDia(dados.ativo.ate)}`}
          </p>
        )}
        {/*
          Sem dizer de onde vêm, os números desta linha seriam lidos como se
          fossem do período escolhido, que é justamente o período em que a
          campanha não existiu.
        */}
        {ausente && (
          <p className="mt-1 text-rotulo text-ink-mute">
            Não rodou no período escolhido. Os números ao lado são de {rotuloDaComparacao}.
          </p>
        )}
      </td>

      <Numero
        valor={formatCentsAsBRL(dados.gastoCentavos)}
        variacao={temComparacao ? linha.variacao?.gastoCentavos : undefined}
      />
      {daPlataforma.map((metrica) => (
        <CelulaDaMetrica key={metrica} metrica={metrica} dados={dados} linha={linha} temComparacao={temComparacao} />
      ))}
      {doWhatsApp.length === 0 ? null : medido ? (
        doWhatsApp.map((metrica) => (
          <CelulaDaMetrica key={metrica} metrica={metrica} dados={dados} linha={linha} temComparacao={temComparacao} />
        ))
      ) : (
        <ColunasSemMedida colunas={doWhatsApp.length} />
      )}
    </tr>
  );
}

/**
 * A variação de um número entre os dois períodos, quando os dois têm o número.
 *
 * Sem um dos lados não há variação: comparar com "não sabemos" inventaria uma
 * subida ou uma queda.
 */
function variacaoEntre(linha: CampanhaComparada, valor: (dados: DesempenhoDeCampanha) => number | null) {
  if (!linha.atual || !linha.anterior) return undefined;
  const atual = valor(linha.atual);
  const anterior = valor(linha.anterior);
  if (atual === null || anterior === null) return undefined;
  return { delta: anterior === 0 ? null : (atual - anterior) / anterior, anterior };
}

function CelulaDaMetrica({
  metrica,
  dados,
  linha,
  temComparacao,
}: {
  metrica: Metrica;
  dados: DesempenhoDeCampanha;
  linha: CampanhaComparada;
  temComparacao: boolean;
}) {
  const variacao = (valor: (d: DesempenhoDeCampanha) => number | null) =>
    temComparacao ? variacaoEntre(linha, valor) : undefined;
  const piso =
    !dados.entregaCompleta && dados.impressoes !== null ? "no mínimo, falta dado de alguns dias" : undefined;
  const inteiro = (numero: number | null) => (numero === null ? SEM_DADO : numero.toLocaleString("pt-BR"));
  const dinheiro = (centavos: number | null, semBase: string) =>
    centavos !== null ? formatCentsAsBRL(centavos) : semBase;

  switch (metrica) {
    case "impressoes":
      return (
        <Numero
          valor={inteiro(dados.impressoes)}
          apagado={dados.impressoes === null}
          variacao={variacao((d) => d.impressoes)}
          nota={piso}
        />
      );
    case "cliques":
      return (
        <Numero
          valor={inteiro(dados.cliques)}
          apagado={dados.cliques === null}
          variacao={variacao((d) => d.cliques)}
          nota={piso}
        />
      );
    case "cpm":
      return (
        <Numero
          valor={dinheiro(dados.cpmCentavos, dados.impressoes === null ? SEM_DADO : "Sem impressão")}
          apagado={dados.cpmCentavos === null}
          variacao={variacao((d) => d.cpmCentavos)}
          invertido
        />
      );
    case "ctr":
      return (
        <Numero
          valor={dados.ctr === null ? (dados.impressoes === null ? SEM_DADO : "Sem impressão") : formataTaxa(dados.ctr)}
          apagado={dados.ctr === null}
          variacao={variacao((d) => d.ctr)}
        />
      );
    case "cpc":
      return (
        <Numero
          valor={dinheiro(dados.cpcCentavos, dados.cliques === null ? SEM_DADO : "Nenhum clique")}
          apagado={dados.cpcCentavos === null}
          variacao={variacao((d) => d.cpcCentavos)}
          invertido
        />
      );
    case "conversas":
      return (
        <Numero
          valor={dados.conversasNaPlataforma === null ? SEM_DADO : String(dados.conversasNaPlataforma)}
          apagado={dados.conversasNaPlataforma === null}
          variacao={variacao((d) => d.conversasNaPlataforma)}
          nota={
            dados.conversasNaPlataforma !== null && !dados.conversasCompletas
              ? "no mínimo, falta dado de alguns dias"
              : undefined
          }
        />
      );
    case "custoPorConversa":
      return (
        <Numero
          valor={dinheiro(
            dados.custoPorConversaCentavos,
            dados.conversasNaPlataforma === null ? SEM_DADO : dados.gastoCentavos > 0 ? "Nenhuma conversa" : "Sem gasto",
          )}
          apagado={dados.custoPorConversaCentavos === null}
          variacao={variacao((d) => d.custoPorConversaCentavos)}
          invertido
        />
      );
    case "leads":
      return (
        <Numero
          valor={String(dados.leads)}
          variacao={temComparacao ? linha.variacao?.leads : undefined}
          nota={
            dados.qualificados > 0
              ? `${dados.qualificados} ${dados.qualificados === 1 ? "qualificado" : "qualificados"}`
              : undefined
          }
        />
      );
    case "custoPorLead":
      return (
        <Numero
          valor={dinheiro(dados.custoPorLeadCentavos, dados.gastoCentavos > 0 ? "Nenhum lead" : "Sem gasto")}
          apagado={dados.custoPorLeadCentavos === null}
          variacao={variacao((d) => d.custoPorLeadCentavos)}
          invertido
        />
      );
    case "vendas":
      return (
        <Numero
          valor={String(dados.vendas)}
          variacao={temComparacao ? linha.variacao?.vendas : undefined}
          nota={dados.custoPorVendaCentavos !== null ? `${formatCentsAsBRL(dados.custoPorVendaCentavos)} cada` : undefined}
        />
      );
    case "receita":
      return (
        <Numero
          valor={formatCentsAsBRL(dados.receitaCentavos)}
          variacao={temComparacao ? linha.variacao?.receitaCentavos : undefined}
          nota={
            dados.vendasSemValor > 0
              ? `${dados.vendasSemValor} ${dados.vendasSemValor === 1 ? "venda" : "vendas"} sem valor registrado`
              : undefined
          }
        />
      );
    case "retorno":
      return (
        <Numero
          valor={retorno(dados.receitaCentavos, dados.gastoCentavos, dados.vendas)}
          apagado={dados.gastoCentavos <= 0 || dados.vendas === 0}
        />
      );
  }
}

/**
 * As colunas que dependem do WhatsApp, quando não há medida.
 *
 * Uma célula só, atravessando todas: repetir "sem medida" em cada uma enchia a
 * tabela de ruído, e o que precisa ser dito é uma frase, uma vez. Escrita por
 * extenso, e não com traço, porque um hífen numa célula é lido como zero.
 */
function ColunasSemMedida({ colunas }: { colunas: number }) {
  return (
    <td colSpan={colunas} className="px-4 py-3.5 text-center align-top text-apoio text-ink-mute">
      Sem medida até o WhatsApp estar recebendo
    </td>
  );
}

export function Numero({
  valor,
  variacao,
  nota,
  apagado = false,
  invertido = false,
}: {
  valor: string;
  variacao?: { delta: number | null; anterior: number };
  nota?: string;
  apagado?: boolean;
  /** Para custo: subir é ruim. */
  invertido?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3.5 text-right align-top tabular-nums ${
        apagado ? "text-apoio text-ink-mute" : "text-ink"
      }`}
    >
      <span className="block">{valor}</span>
      {variacao && (
        <span className="mt-0.5 block">
          <Delta delta={variacao.delta} invertido={invertido} />
        </span>
      )}
      {nota && <span className="mt-0.5 block whitespace-normal text-rotulo font-normal text-ink-mute">{nota}</span>}
    </td>
  );
}
