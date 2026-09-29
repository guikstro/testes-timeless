import Link from "next/link";
import { AtualizaAoVivo } from "@/components/notifications/atualiza-ao-vivo";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { apiFetch } from "@/lib/api-client";
import { AvisoDeMedicao } from "@/components/aviso-de-medicao";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { formatCentsAsBRL } from "@/lib/currency";
import { inicioDaMedicao, Medicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { DesempenhoDeCampanhas } from "../campanhas/tipos";
import { formataDia } from "@/lib/periodo";
import { AbaVisaoGeral } from "./aba-visao-geral";
import { AbaFunil } from "./aba-funil";
import { AbaOrigem } from "./aba-origem";
import { AbaAtendimento } from "./aba-atendimento";
import { Procedencia } from "./procedencia";
import { concluiAtendimento, concluiFunil, concluiOrigem, concluiVisaoGeral } from "./conclusao";
import { Overview } from "./tipos";
import { Alert } from "@/components/ui/alert";
import { Frescor, FrescorDosDados } from "@/components/ui/frescor";
import { sessaoAtual } from "@/lib/sessao";
import { temPresencaLocal } from "@/lib/foco";
import { concluiPresencaLocal, PainelPresencaLocal, PresencaLocal } from "./painel-presenca-local";

const PERIODOS = [7, 30, 90];

/**
 * Uma pergunta por aba.
 *
 * A tela anterior empilhava oito painéis numa rolagem só, e responder
 * "quantos leads entraram" exigia passar por gráfico de horário, tabela de
 * origem e funil. Aqui cada aba responde uma coisa, e o que não é daquela
 * pergunta não aparece.
 */
const ABAS_DE_LEADS = [
  { chave: "geral", rotulo: "Visão geral", conclui: concluiVisaoGeral },
  { chave: "funil", rotulo: "Funil", conclui: concluiFunil },
  { chave: "origem", rotulo: "Origem", conclui: concluiOrigem },
  { chave: "atendimento", rotulo: "Atendimento", conclui: concluiAtendimento },
] as const;

/** Para quem tem os dois focos, a presença local vira mais uma aba. */
const ABA_LOCAL = { chave: "local", rotulo: "Presença local", conclui: () => "" } as const;

type Aba = (typeof ABAS_DE_LEADS)[number]["chave"] | "local";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; aba?: string }>;
}) {
  const params = await searchParams;
  const days = PERIODOS.includes(Number(params.days)) ? Number(params.days) : 30;
  const { organization } = await sessaoAtual();

  // Só presença local: o painel inteiro é o do Google, sem nada de lead.
  if (organization.foco === "PRESENCA_LOCAL") return <DashboardDePresencaLocal days={days} />;

  const ABAS = temPresencaLocal(organization.foco) ? [...ABAS_DE_LEADS, ABA_LOCAL] : ABAS_DE_LEADS;
  const aba: Aba = ABAS.some((opcao) => opcao.chave === params.aba) ? (params.aba as Aba) : "geral";
  const local = aba === "local" ? await apiFetch<PresencaLocal>(`/presenca-local?days=${days}`) : null;

  const [overview, conexao, frescor] = await Promise.all([
    apiFetch<Overview>(`/analytics/overview?days=${days}`),
    conexaoDoWhatsApp(),
    buscaFrescor(),
  ]);
  const { totals, setup } = overview;

  const de = overview.period.from.slice(0, 10);
  const ate = overview.period.to.slice(0, 10);
  const medicao = medicaoDeLeads({ conexao, ate, leads: totals.leads });

  // Sem o WhatsApp medindo, as abas de lead não têm o que mostrar; a de
  // presença local continua, porque quem mede ligação e rota é o Google.
  const abasVisiveis = medicao === "medido" ? ABAS : ABAS.filter((opcao) => opcao.chave === "geral" || opcao.chave === "local");

  // Só quando não há medida: é o que se sabe do período sem o WhatsApp, e a
  // tela precisa ter algo verdadeiro para mostrar no lugar das abas.
  const anuncios =
    medicao === "medido"
      ? null
      : await apiFetch<DesempenhoDeCampanhas>(`/analytics/campanhas?de=${de}&ate=${ate}`).catch(() => null);

  const semOrigem = overview.byOrigin.find((bucket) => bucket.key === "unknown");
  const maioriaSemOrigem = totals.leads > 0 && (semOrigem?.leads ?? 0) / totals.leads >= 0.5;

  const escolhida = ABAS.find((opcao) => opcao.chave === aba)!;
  const paraAba = (destino: string) => `/dashboard?aba=${destino}&days=${days}`;

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
            <p className="text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
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
            <p className="mt-0.5 text-corpo text-ink-mute">
              {local
                ? concluiPresencaLocal(local)
                : medicao === "medido"
                  ? escolhida.conclui(overview)
                  : "Sem WhatsApp recebendo, não há lead para medir neste período."}
            </p>
            <FrescorDosDados
              frescor={frescor}
              fontes={local ? ["google"] : ["meta", "google"]}
              aoVivo={!local && medicao === "medido"}
              className="mt-2"
            />
          </div>

          <GrupoDePilulas
            ativo={String(days)}
            opcoes={PERIODOS.map((opcao) => ({
              chave: String(opcao),
              rotulo: `${opcao} dias`,
              href: `/dashboard?aba=${aba}&days=${opcao}`,
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

      {local ? <PainelPresencaLocal dados={local} /> : null}

      {!local && medicao !== "medido" ? (
        <SemMedicao
          medicao={medicao}
          desde={conexao ? inicioDaMedicao(conexao) : null}
          anuncios={anuncios}
        />
      ) : null}

      {medicao === "medido" && aba === "geral" ? <AbaVisaoGeral overview={overview} /> : null}
      {medicao === "medido" && aba === "funil" ? <AbaFunil overview={overview} /> : null}
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
      {!local && medicao === "medido" && maioriaSemOrigem ? (
        <Alert tom="warning" className="mt-6" titulo="A maior parte dos leads está sem origem identificada.">
          <p>
            A origem só é registrada quando a pessoa chega por um anúncio Click-to-WhatsApp ou por um link
            rastreável. Quem manda mensagem direto para o número não carrega essa evidência, e ela nunca é deduzida
            por aproximação.
          </p>
          <ul className="mt-2 space-y-1">
            {!setup.metaConnected ? (
              <li>
                · <Link href="/integrations/meta" className="underline">Conecte sua conta Meta</Link> para
                identificar leads vindos de anúncios.
              </li>
            ) : null}
            {setup.trackingLinkCount === 0 ? (
              <li>
                · <Link href="/links" className="underline">Crie um link rastreável</Link> para usar na bio e em
                campanhas.
              </li>
            ) : null}
            {!setup.whatsappConnected ? (
              <li>
                · <Link href="/integrations/whatsapp" className="underline">Conecte seu WhatsApp</Link> para receber
                novos leads.
              </li>
            ) : null}
          </ul>
        </Alert>
      ) : null}

      {!local && medicao === "medido" ? <Procedencia overview={overview} /> : null}
    </div>
  );
}

/**
 * O painel quando não há lead para medir.
 *
 * As quatro abas eram pintadas mesmo assim, todas com zero, e o painel
 * parecia um segundo Gerenciador de Anúncios que não sabia nada. Aqui ele diz
 * o que se sabe (o gasto e as conversas que a Meta contou), o que não se sabe,
 * e o que passa a aparecer quando o WhatsApp estiver recebendo.
 */
function SemMedicao({
  medicao,
  desde,
  anuncios,
}: {
  medicao: Exclude<Medicao, "medido">;
  desde: string | null;
  anuncios: DesempenhoDeCampanhas | null;
}) {
  const gasto = anuncios?.totais.gastoCentavos ?? null;
  const conversas = anuncios?.totais.conversasNaPlataforma ?? null;

  return (
    <div className="space-y-5">
      <AvisoDeMedicao medicao={medicao} desde={desde} conversasNaPlataforma={conversas} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Investimento em anúncios" valor={gasto === null ? "Sem dado" : formatCentsAsBRL(gasto)} />
        <Numero
          rotulo="Conversas na Meta"
          valor={conversas === null ? "Sem dado" : String(conversas)}
          nota="O que o Gerenciador de Anúncios conta"
        />
        <Numero rotulo="Leads aqui" valor="Sem medida" apagado />
      </div>

      <div className="surface p-5">
        <p className="text-corpo font-semibold text-ink">O que aparece aqui com o WhatsApp recebendo</p>
        <ul className="mt-3 grid gap-x-8 gap-y-2 text-apoio leading-relaxed text-ink-mute sm:grid-cols-2">
          <li>Quantos leads entraram por dia, e quanto isso mudou.</li>
          <li>De qual campanha e de qual anúncio cada lead veio.</li>
          <li>Quantos viraram reunião e venda, e quanto cada um custou.</li>
          <li>Quanto tempo a equipe leva para responder.</li>
        </ul>
        <Link
          href="/campanhas"
          className="focus-ring mt-4 inline-flex text-apoio font-medium text-ink underline underline-offset-2"
        >
          Ver o gasto por campanha
        </Link>
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
  apagado = false,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  apagado?: boolean;
}) {
  return (
    <div className="surface p-4">
      <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">{rotulo}</p>
      <p
        className={`mt-1.5 font-display font-semibold tabular-nums ${
          apagado ? "text-lg text-ink-mute" : "text-xl text-ink"
        }`}
      >
        {valor}
      </p>
      {nota ? <p className="mt-1 text-rotulo text-ink-mute">{nota}</p> : null}
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
          <p className="text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
            {formataDia(dados.periodo.de)} a {formataDia(dados.periodo.ate)}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Presença local</h1>
          <p className="mt-0.5 text-corpo text-ink-mute">{concluiPresencaLocal(dados)}</p>
          <FrescorDosDados frescor={frescor} fontes={["google"]} className="mt-2" />
        </div>
        <GrupoDePilulas
          ativo={String(days)}
          opcoes={PERIODOS.map((opcao) => ({ chave: String(opcao), rotulo: `${opcao} dias`, href: `/dashboard?days=${opcao}` }))}
        />
      </header>
      <PainelPresencaLocal dados={dados} />
    </div>
  );
}

/** De quando é o dado. Opcional: sem ele a tela continua, só sem a linha. */
function buscaFrescor(): Promise<Frescor | null> {
  return apiFetch<Frescor>("/analytics/frescor").catch(() => null);
}
