import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
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
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{hint ?? " "}</p>
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
          <span className="w-24 shrink-0 text-xs text-slate-500">{stage.label}</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className="h-5 rounded-r-[4px] bg-[#2a78d6]"
              style={{ width: `${Math.max(2, (stage.value / widest) * 100)}%` }}
            />
            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{stage.value}</span>
            {stage.hint ? <span className="shrink-0 text-xs text-slate-400">{stage.hint}</span> : null}
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
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {totals.leads > 0
              ? `${totals.leads} lead(s) nos últimos ${days} dias`
              : `Nenhum lead nos últimos ${days} dias`}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PERIODS.map((option) => (
            <Link
              key={option}
              href={`/dashboard?days=${option}`}
              aria-current={option === days ? "page" : undefined}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                option === days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {option} dias
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Leads" value={String(totals.leads)} hint={totals.disqualified > 0 ? `${totals.disqualified} desqualificado(s)` : undefined} />
        <Stat
          label="Qualificados"
          value={String(totals.qualified)}
          hint={`${formatRate(totals.qualificationRate)} de ${totals.workable}`}
        />
        <Stat label="Reuniões" value={String(totals.meetings)} />
        <Stat label="Vendas" value={String(totals.won)} hint={`${formatRate(totals.closeRate)} dos qualificados`} />
        <Stat label="Receita" value={formatCentsAsBRL(totals.revenueCents)} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Leads e vendas por dia</h2>
            <p className="mt-0.5 text-xs text-slate-500">Passe o mouse para ver um dia específico</p>
          </div>
          {/* Rótulo direto no pico: um valor por ponto viraria ruído, e sem
              nenhum o gráfico dependeria do hover para informar qualquer coisa. */}
          {peakDay && peakDay.leads > 0 ? (
            <p className="text-xs text-slate-500">
              Pico: <span className="font-semibold text-slate-900">{peakDay.leads}</span> em{" "}
              {new Date(`${peakDay.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </p>
          ) : null}
        </div>

        {totals.leads > 0 ? (
          <>
            <LeadsAreaChart data={daily} />
            {/* O tooltip enriquece, não pode ser a única via: a tabela mantém
                todo valor acessível sem depender de ponteiro. */}
            <details className="mt-4 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Ver os números</summary>
              <div className="mt-3 max-h-56 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
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
                        <tr key={point.date} className="border-t border-slate-100">
                          <td className="py-1 pr-4 text-slate-600">{point.date.split("-").reverse().join("/")}</td>
                          <td className="py-1 pr-4 tabular-nums text-slate-800">{point.leads}</td>
                          <td className="py-1 tabular-nums text-slate-800">{point.won}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">Nenhum lead neste período.</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Funil</h2>
          <p className="mb-5 mt-0.5 text-xs text-slate-500">Onde os leads param de avançar</p>
          <Funnel totals={totals} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">De onde vieram</h2>
          {/*
            Todo lead deste produto nasce de uma mensagem no WhatsApp — é o
            único caminho de criação. Por isso a quebra não é por canal, e sim
            por origem: o que muda é a evidência de onde a pessoa veio.
          */}
          <p className="mb-4 mt-0.5 text-xs text-slate-500">
            Todo lead chega pelo WhatsApp; o que muda é a origem.
          </p>

          {byOrigin.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-400">
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
                    <tr key={bucket.key} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-slate-800">{bucket.label}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{bucket.leads}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{bucket.meetings}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{bucket.won}</td>
                      <td className="py-2 tabular-nums text-slate-700">{formatCentsAsBRL(bucket.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Nenhum lead neste período.</p>
          )}
        </div>
      </div>

      {mostlyUnattributed ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">A maior parte dos leads está sem origem identificada.</p>
          <p className="mt-1 text-amber-800">
            A origem só é registrada quando a pessoa chega por um anúncio Click-to-WhatsApp ou por um link
            rastreável. Quem manda mensagem direto para o número não carrega essa evidência — e ela nunca é
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
