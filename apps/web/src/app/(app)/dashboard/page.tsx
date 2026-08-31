import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";

interface OriginBucket {
  key: string;
  label: string;
  leads: number;
  qualified: number;
  meetings: number;
  won: number;
  revenueCents: number;
}

interface DailyPoint {
  date: string;
  leads: number;
  won: number;
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

function formatDayLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: rawDays } = await searchParams;
  const days = PERIODS.includes(Number(rawDays)) ? Number(rawDays) : 30;

  const overview = await apiFetch<Overview>(`/analytics/overview?days=${days}`);
  const { totals, byOrigin, daily, setup } = overview;

  const peak = Math.max(1, ...daily.map((point) => point.leads));
  const unattributed = byOrigin.find((bucket) => bucket.key === "unknown");
  // Só vale alertar sobre atribuição se existir lead para atribuir.
  const mostlyUnattributed =
    totals.leads > 0 && (unattributed?.leads ?? 0) / totals.leads >= 0.5;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PERIODS.map((option) => (
            <Link
              key={option}
              href={`/dashboard?days=${option}`}
              className={`rounded px-3 py-1 text-sm ${
                option === days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
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
          value={String(totals.leads)}
          hint={
            totals.disqualified > 0
              ? `${totals.disqualified} desqualificado(s)`
              : `nos últimos ${days} dias`
          }
        />
        {/*
          A taxa é sobre os aproveitáveis, não sobre o total: um lead descartado
          nunca foi oportunidade, e mantê-lo no denominador faria a conversão
          parecer pior do que foi. A base fica escrita no rodapé do número para
          a conta ser conferível.
        */}
        <Stat
          label="Qualificados"
          value={String(totals.qualified)}
          hint={`${formatRate(totals.qualificationRate)} de ${totals.workable} aproveitáveis`}
        />
        <Stat
          label="Reuniões"
          value={String(totals.meetings)}
          hint={totals.qualified > 0 ? `${formatRate(totals.meetings / totals.qualified)} dos qualificados` : "—"}
        />
        <Stat label="Vendas" value={String(totals.won)} hint={`${formatRate(totals.closeRate)} dos qualificados`} />
        <Stat label="Receita" value={formatCentsAsBRL(totals.revenueCents)} />
      </div>

      {/*
        Todo lead deste produto nasce de uma mensagem no WhatsApp — é o único
        caminho de criação. Por isso a quebra não é por canal, e sim por origem:
        o que muda entre um lead e outro é a evidência de onde a pessoa veio.
      */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">De onde vieram</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">
          Todo lead chega pelo WhatsApp. O que muda é a origem: um anúncio da Meta, um link seu, ou nenhuma
          evidência.
        </p>

        {byOrigin.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Origem</th>
                  <th className="py-2 pr-4 font-medium">Leads</th>
                  <th className="py-2 pr-4 font-medium">Qualificados</th>
                  <th className="py-2 pr-4 font-medium">Reuniões</th>
                  <th className="py-2 pr-4 font-medium">Vendas</th>
                  <th className="py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {byOrigin.map((bucket) => (
                  <tr key={bucket.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-800">{bucket.label}</td>
                    <td className="py-2 pr-4 text-slate-700">{bucket.leads}</td>
                    <td className="py-2 pr-4 text-slate-700">{bucket.qualified}</td>
                    <td className="py-2 pr-4 text-slate-700">{bucket.meetings}</td>
                    <td className="py-2 pr-4 text-slate-700">{bucket.won}</td>
                    <td className="py-2 text-slate-700">{formatCentsAsBRL(bucket.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nenhum lead neste período.</p>
        )}

        {/*
          "Origem desconhecida: 100%" sem dizer o que fazer é uma constatação
          inútil. O que falta conectar é a informação que resolve.
        */}
        {mostlyUnattributed ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
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
                  para usar na bio, em campanhas e em outros canais.
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

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Leads por dia</h2>
        {totals.leads > 0 ? (
          <div className="flex h-40 items-end gap-1 overflow-x-auto">
            {daily.map((point) => (
              <div key={point.date} className="flex min-w-[14px] flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-slate-200"
                  // Dias sem lead ficam com uma faixa mínima visível, para a
                  // ausência ser legível em vez de virar um buraco no gráfico.
                  style={{ height: `${Math.max(2, (point.leads / peak) * 100)}%` }}
                  title={`${formatDayLabel(point.date)}: ${point.leads} lead(s), ${point.won} venda(s)`}
                />
                <span className="text-[10px] text-slate-400">{formatDayLabel(point.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nenhum lead neste período.</p>
        )}
      </div>
    </div>
  );
}
