import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { CountUp } from "@/components/ui/count-up";
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
  byOrigin: OriginBucket[];
  daily: DailyPoint[];
  setup: { whatsappConnected: boolean; metaConnected: boolean; trackingLinkCount: number };
}

const PERIODS = [7, 30, 90];

function formatRate(rate: number | null): string {
  // Null é "não houve base para calcular" — 0% afirmaria que ninguém converteu.
  if (rate === null) return "Sem base";
  return `${Math.round(rate * 100)}%`;
}

/**
 * Cartão de número.
 *
 * `numero` faz o valor subir ao entrar na tela; `valor` cobre o que não é
 * contável. A borda inferior acende no hover: o cartão responde sem se mexer,
 * porque uma fileira de números que salta a cada passada de mouse cansa.
 */
function Stat({
  label,
  numero,
  valor,
  hint,
  formato,
}: {
  label: string;
  numero?: number;
  valor?: string;
  hint?: string;
  formato?: "inteiro" | "moeda";
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-5 shadow-subtle transition-shadow duration-300 ease-soft hover:shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-mute">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-ink">
        {numero !== undefined ? <CountUp value={numero} formato={formato} /> : valor}
      </p>
      <p className="mt-2 text-xs text-ink-mute">{hint ?? " "}</p>
      <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-500 ease-soft group-hover:scale-x-100" />
    </div>
  );
}

/**
 * Funil em barras horizontais, com a maior etapa como referência de largura.
 *
 * Não usei a forma de funil (trapézios que afinam): ela codifica o valor na
 * área, que se lê muito pior que comprimento — duas etapas próximas viram
 * fatias visualmente iguais. Barra a partir de uma linha de base comum é a
 * comparação que o olho faz certo.
 */
function Funnel({ totals }: { totals: Overview["totals"] }) {
  const stages = [
    { label: "Leads", value: totals.workable, hint: "descontando os desqualificados" },
    { label: "Qualificados", value: totals.qualified, hint: formatRate(totals.qualificationRate) },
    { label: "Reuniões", value: totals.meetings, hint: "" },
    { label: "Vendas", value: totals.won, hint: formatRate(totals.closeRate) },
  ];
  const widest = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-ink-mute">{stage.label}</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className="h-5 rounded-r-[4px] bg-accent"
              style={{ width: `${Math.max(2, (stage.value / widest) * 100)}%` }}
            />
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{stage.value}</span>
            {stage.hint ? <span className="shrink-0 text-xs text-ink-mute">{stage.hint}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: rawDays } = await searchParams;
  const days = PERIODS.includes(Number(rawDays)) ? Number(rawDays) : 30;

  const overview = await apiFetch<Overview>(`/analytics/overview?days=${days}`);
  const { totals, byOrigin, daily, setup } = overview;

  const unattributed = byOrigin.find((bucket) => bucket.key === "unknown");
  const mostlyUnattributed = totals.leads > 0 && (unattributed?.leads ?? 0) / totals.leads >= 0.5;
  const peakDay = daily.reduce((best, point) => (point.leads > best.leads ? point : best), daily[0]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-mute">
            {totals.leads > 0
              ? `${totals.leads} lead(s) nos últimos ${days} dias`
              : `Nenhum lead nos últimos ${days} dias`}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
          {PERIODS.map((option) => (
            <Link
              key={option}
              href={`/dashboard?days=${option}`}
              aria-current={option === days ? "page" : undefined}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                option === days ? "bg-ink text-canvas" : "text-ink-soft hover:bg-panel-soft"
              }`}
            >
              {option} dias
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat
          label="Leads"
          numero={totals.leads}
          hint={totals.disqualified > 0 ? `${totals.disqualified} desqualificado(s)` : `últimos ${days} dias`}
        />
        <Stat
          label="Qualificados"
          numero={totals.qualified}
          hint={`${formatRate(totals.qualificationRate)} de ${totals.workable}`}
        />
        <Stat
          label="Reuniões"
          numero={totals.meetings}
          hint={totals.qualified > 0 ? `${formatRate(totals.meetings / totals.qualified)} dos qualificados` : undefined}
        />
        <Stat label="Vendas" numero={totals.won} hint={`${formatRate(totals.closeRate)} dos qualificados`} />
        <Stat
          label="Receita"
          numero={Math.round(totals.revenueCents / 100)}
          formato="moeda"
          hint={totals.won > 0 ? `${formatCentsAsBRL(Math.round(totals.revenueCents / totals.won))} por venda` : undefined}
        />
      </div>

      <div className="mb-6 rounded-xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">Leads e vendas por dia</h2>
            <p className="mt-0.5 text-xs text-ink-mute">Passe o mouse para ver um dia específico</p>
          </div>
          {/* Rótulo direto no pico: um valor por ponto viraria ruído, e sem
              nenhum o gráfico dependeria do hover para informar qualquer coisa. */}
          {peakDay && peakDay.leads > 0 ? (
            <p className="text-xs text-ink-mute">
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
              <summary className="cursor-pointer text-xs text-ink-mute hover:text-ink-soft">Ver os números</summary>
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

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-6">
          <h2 className="text-sm font-semibold text-ink">Funil</h2>
          <p className="mb-5 mt-0.5 text-xs text-ink-mute">Onde os leads param de avançar</p>
          <Funnel totals={totals} />
        </div>

        <div className="rounded-xl border border-line bg-panel p-6">
          <h2 className="text-sm font-semibold text-ink">De onde vieram</h2>
          {/*
            Todo lead deste produto nasce de uma mensagem no WhatsApp. É o
            único caminho de criação. Por isso a quebra não é por canal, e sim
            por origem: o que muda é a evidência de onde a pessoa veio.
          */}
          <p className="mb-4 mt-0.5 text-xs text-ink-mute">
            Todo lead chega pelo WhatsApp; o que muda é a origem.
          </p>

          {byOrigin.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-ink-mute">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Origem</th>
                    <th className="py-2 pr-3 font-medium">Leads</th>
                    <th className="py-2 pr-3 font-medium">Reuniões</th>
                    <th className="py-2 pr-3 font-medium">Vendas</th>
                    <th className="py-2 font-medium">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {byOrigin.map((bucket) => (
                    <tr key={bucket.key} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-4 text-ink">{bucket.label}</td>
                      <td className="py-2 pr-3 tabular-nums text-ink-soft">{bucket.leads}</td>
                      <td className="py-2 pr-3 tabular-nums text-ink-soft">{bucket.meetings}</td>
                      <td className="py-2 pr-3 tabular-nums text-ink-soft">{bucket.won}</td>
                      <td className="py-2 tabular-nums text-ink-soft">{formatCentsAsBRL(bucket.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ink-mute">Nenhum lead neste período.</p>
          )}
        </div>
      </div>

      {mostlyUnattributed ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">A maior parte dos leads está sem origem identificada.</p>
          <p className="mt-1 text-amber-800">
            A origem só é registrada quando a pessoa chega por um anúncio Click-to-WhatsApp ou por um link
            rastreável. Quem manda mensagem direto para o número não carrega essa evidência, e ela nunca é
            deduzida por aproximação.
          </p>
          <ul className="mt-2 space-y-1 text-amber-800">
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
