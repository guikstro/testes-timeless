import Link from "next/link";
import { AtualizaAoVivo } from "@/components/notifications/atualiza-ao-vivo";
import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { Hero } from "./hero";
import { Funil3D } from "./funil-3d";
import { formatDuration, responseSpeedTone, SPEED_TONE_CLASSES } from "@/lib/duration";
import { ArrivalHeatmap } from "./arrival-heatmap";
import { OriginTable } from "./origin-table";
import { StatCard } from "./stat-card";
import { DailyPoint, LeadsAreaChart } from "./leads-area-chart";

interface OriginBucket {
  key: string;
  label: string;
  leads: number;
  qualified: number;
  meetings: number;
  won: number;
  disqualified: number;
  revenueCents: number;
}

interface Variacao {
  delta: number | null;
  anterior: number;
}

interface Overview {
  period: { days: number; from: string; to: string };
  totals: {
    leads: number;
    disqualified: number;
    workable: number;
    qualified: number;
    meetings: number;
    won: number;
    revenueCents: number;
    qualificationRate: number | null;
    closeRate: number | null;
  };
  comparacao: {
    leads: Variacao;
    qualified: Variacao;
    meetings: Variacao;
    won: Variacao;
    revenueCents: Variacao;
  };
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    respondidos: number;
    semResposta: number;
    aguardando: number;
  };
  byOrigin: OriginBucket[];
  daily: DailyPoint[];
  chegadas: { diaSemana: number; faixa: number; leads: number }[];
  setup: { whatsappConnected: boolean; metaConnected: boolean; trackingLinkCount: number };
}

const PERIODS = [7, 30, 90];

function plural(quantidade: number, singular: string, muitos: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : muitos}`;
}

function formatRate(rate: number | null): string {
  // Null é "não houve base para calcular" — 0% afirmaria que ninguém converteu.
  if (rate === null) return "Sem base";
  return `${Math.round(rate * 100)}%`;
}



export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: rawDays } = await searchParams;
  const days = PERIODS.includes(Number(rawDays)) ? Number(rawDays) : 30;

  const overview = await apiFetch<Overview>(`/analytics/overview?days=${days}`);
  const { totals, byOrigin, daily, setup, comparacao, atendimento, chegadas } = overview;

  const unattributed = byOrigin.find((bucket) => bucket.key === "unknown");
  const mostlyUnattributed = totals.leads > 0 && (unattributed?.leads ?? 0) / totals.leads >= 0.5;
  const peakDay = daily.reduce((best, point) => (point.leads > best.leads ? point : best), daily[0]);

  return (
    <div className="mx-auto max-w-6xl">
      <Hero
        dias={days}
        periodos={PERIODS}
        de={overview.period.from.slice(0, 10)}
        ate={overview.period.to.slice(0, 10)}
        leads={totals.leads}
        deltaLeads={comparacao.leads.delta}
        receitaCentavos={totals.revenueCents}
        deltaReceita={comparacao.revenueCents.delta}
        secundarios={[
          {
            rotulo: "Aproveitáveis",
            valor: String(totals.workable),
            nota: totals.disqualified > 0 ? plural(totals.disqualified, "descartado", "descartados") : undefined,
          },
          { rotulo: "Taxa de qualificação", valor: formatRate(totals.qualificationRate) },
          { rotulo: "Taxa de fechamento", valor: formatRate(totals.closeRate) },
          {
            rotulo: "Ticket médio",
            valor: totals.won > 0 ? formatCentsAsBRL(Math.round(totals.revenueCents / totals.won)) : "Sem base",
          },
        ]}
      />

      <AtualizaAoVivo />

      {/*
        O funil vem logo depois da abertura porque é a pergunta que a tela
        existe para responder: onde some gente entre a mensagem e a venda.
      */}
      <div className="surface mt-5 p-6">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Onde os leads param</h2>
        <p className="mb-4 mt-0.5 text-apoio text-ink-mute">
          A largura de cada disco é a etapa. A parede entre dois discos é quem saiu.
        </p>
        <Funil3D
          etapas={[
            { rotulo: "Leads", valor: totals.workable },
            { rotulo: "Qualificados", valor: totals.qualified },
            { rotulo: "Reuniões", valor: totals.meetings },
            { rotulo: "Vendas", valor: totals.won },
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Qualificados"
          numero={totals.qualified}
          delta={comparacao.qualified.delta}
          anterior={comparacao.qualified.anterior}
          nota={`de ${totals.workable} aproveitáveis`}
        />
        <StatCard
          rotulo="Reuniões"
          numero={totals.meetings}
          delta={comparacao.meetings.delta}
          anterior={comparacao.meetings.anterior}
          nota={totals.qualified > 0 ? `${formatRate(totals.meetings / totals.qualified)} dos qualificados` : undefined}
        />
        <StatCard
          rotulo="Vendas"
          numero={totals.won}
          delta={comparacao.won.delta}
          anterior={comparacao.won.anterior}
          serie={daily.map((d) => d.won)}
          nota={`${formatRate(totals.closeRate)} dos qualificados`}
        />
      </div>

      <div className="surface mt-5 p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Leads e vendas por dia</h2>
            <p className="mt-0.5 text-apoio text-ink-mute">Passe o mouse para ver um dia específico</p>
          </div>
          {/* Rótulo direto no pico: um valor por ponto viraria ruído, e sem
              nenhum o gráfico dependeria do hover para informar qualquer coisa. */}
          {peakDay && peakDay.leads > 0 ? (
            <p className="text-apoio text-ink-mute">
              Pico: <span className="font-semibold text-ink">{peakDay.leads}</span> em{" "}
              {new Date(`${peakDay.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </p>
          ) : null}
        </div>

        {totals.leads > 0 ? (
          <>
            <LeadsAreaChart data={daily} />
            {/* O tooltip enriquece, não pode ser a única via: a tabela mantém
                todo valor acessível sem depender de ponteiro. */}
            <details className="mt-4 border-t border-line/60 pt-3">
              <summary className="cursor-pointer text-apoio text-ink-mute hover:text-ink-soft">Ver os números</summary>
              <div className="mt-3 max-h-56 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-ink-mute">
                    <tr>
                      <th className="py-1 pr-4 font-medium">Dia</th>
                      <th className="py-1 pr-4 font-medium">Leads</th>
                      <th className="py-1 font-medium">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily
                      .filter((point) => point.leads > 0 || point.won > 0)
                      .map((point) => (
                        <tr key={point.date} className="border-t border-line/60">
                          <td className="py-1 pr-4 text-ink-soft">{point.date.split("-").reverse().join("/")}</td>
                          <td className="py-1 pr-4 tabular-nums text-ink">{point.leads}</td>
                          <td className="py-1 tabular-nums text-ink">{point.won}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-ink-mute">Nenhum lead neste período.</p>
        )}
      </div>

      {/*
        Atendimento ganhou painel próprio porque responde a pergunta que mais
        muda resultado numa operação de WhatsApp: quanto tempo alguém espera
        para ser atendido. Antes esse número só existia dentro de cada lead.
      */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-rotulo font-medium uppercase tracking-[0.1em] text-ink-mute">Resposta típica</p>
          <p className={`mt-2 text-[clamp(1.5rem,3vw,1.75rem)] font-semibold leading-none tabular-nums ${SPEED_TONE_CLASSES[responseSpeedTone(atendimento.medianaPrimeiraRespostaSegundos)]}`}>
            {formatDuration(atendimento.medianaPrimeiraRespostaSegundos)}
          </p>
          {/* Mediana e não média: um lead respondido três dias depois puxaria
              a média e faria uma operação boa parecer ruim. */}
          <p className="mt-2 text-rotulo text-ink-mute">Mediana até a primeira resposta</p>
        </div>

        <div className="surface p-5">
          <p className="text-rotulo font-medium uppercase tracking-[0.1em] text-ink-mute">Aguardando você</p>
          <p className="mt-2 flex items-baseline gap-2 text-[clamp(1.5rem,3vw,1.75rem)] font-semibold leading-none tabular-nums text-ink">
            {atendimento.aguardando}
            {atendimento.aguardando > 0 ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
            ) : null}
          </p>
          <Link href="/leads?aguardando=1" className="focus-ring mt-2 inline-block rounded text-rotulo text-ink-mute underline decoration-line underline-offset-4 transition-colors hover:text-ink">
            Ver na fila
          </Link>
        </div>

        <div className="surface p-5">
          <p className="text-rotulo font-medium uppercase tracking-[0.1em] text-ink-mute">Sem resposta</p>
          <p className="mt-2 text-[clamp(1.5rem,3vw,1.75rem)] font-semibold leading-none tabular-nums text-ink">{atendimento.semResposta}</p>
          <p className="mt-2 text-rotulo text-ink-mute">
            de {atendimento.respondidos + atendimento.semResposta} leads no período
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">


        <div className="surface p-6">
          <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Qual origem fecha melhor</h2>
          {/* Volume esconde qualidade: a origem que traz mais gente
              frequentemente não é a que fecha melhor. */}
          <p className="mb-4 mt-0.5 text-apoio text-ink-mute">Clique num título para reordenar</p>
          {byOrigin.length > 0 ? (
            <OriginTable origens={byOrigin} />
          ) : (
            <p className="py-8 text-center text-sm text-ink-mute">Nenhum lead neste período.</p>
          )}
        </div>
      </div>

      <div className="surface mt-5 p-6">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Quando os leads chegam</h2>
        <p className="mb-5 mt-0.5 text-apoio text-ink-mute">
          Por dia da semana e faixa de horário, no horário de Brasília
        </p>
        <ArrivalHeatmap celulas={chegadas} />
      </div>

      {mostlyUnattributed ? (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">A maior parte dos leads está sem origem identificada.</p>
          <p className="mt-1 text-amber-800 dark:text-amber-200/90">
            A origem só é registrada quando a pessoa chega por um anúncio Click-to-WhatsApp ou por um link
            rastreável. Quem manda mensagem direto para o número não carrega essa evidência, e ela nunca é
            deduzida por aproximação.
          </p>
          <ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-200/90">
            {!setup.metaConnected ? (
              <li>
                ·{" "}
                <Link href="/integrations/meta" className="underline">
                  Conecte sua conta Meta
                </Link>{" "}
                para identificar leads vindos de anúncios.
              </li>
            ) : null}
            {setup.trackingLinkCount === 0 ? (
              <li>
                ·{" "}
                <Link href="/links" className="underline">
                  Crie um link rastreável
                </Link>{" "}
                para usar na bio e em campanhas.
              </li>
            ) : null}
            {!setup.whatsappConnected ? (
              <li>
                ·{" "}
                <Link href="/integrations/whatsapp" className="underline">
                  Conecte seu WhatsApp
                </Link>{" "}
                para receber novos leads.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
