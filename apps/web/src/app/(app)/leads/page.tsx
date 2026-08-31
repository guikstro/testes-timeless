import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { attributionSourceLabel, AttributionSummary } from "@/lib/attribution";
import { formatCentsAsBRL } from "@/lib/currency";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/skeleton";
import { LeadsFilters } from "./leads-filters";

interface LeadListItem {
  id: string;
  name: string | null;
  normalizedPhone: string;
  status: "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";
  disqualifiedAt: string | null;
  firstContactAt: string;
  lastContactAt: string;
  attribution: AttributionSummary | null;
  sale: { amountCents: number | null } | null;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

const PAGINA = 25;

const STATUS: Record<LeadListItem["status"], { rotulo: string; tom: "neutral" | "info" | "brand" | "success" }> = {
  NEW: { rotulo: "Novo", tom: "neutral" },
  QUALIFIED: { rotulo: "Qualificado", tom: "info" },
  MEETING_SCHEDULED: { rotulo: "Reunião marcada", tom: "brand" },
  WON: { rotulo: "Venda", tom: "success" },
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const pagina = Math.max(1, Number(params.page ?? "1") || 1);

  const consulta = new URLSearchParams({ limit: String(PAGINA), offset: String((pagina - 1) * PAGINA) });
  if (params.search) consulta.set("search", params.search);
  if (params.status) consulta.set("status", params.status);

  const { items, total } = await apiFetch<PaginatedResult<LeadListItem>>(`/leads?${consulta.toString()}`);
  const ultimaPagina = Math.max(1, Math.ceil(total / PAGINA));
  const filtrando = Boolean(params.search || params.status);

  function linkPagina(destino: number) {
    const novos = new URLSearchParams();
    if (params.search) novos.set("search", params.search);
    if (params.status) novos.set("status", params.status);
    if (destino > 1) novos.set("page", String(destino));
    const query = novos.toString();
    return query ? `/leads?${query}` : "/leads";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Leads</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">Cada conversa que chegou pelo WhatsApp, com a origem provada.</p>

      <LeadsFilters total={total} />

      {items.length === 0 ? (
        <div className="surface">
          <EmptyState
            title={filtrando ? "Nenhum lead com esses filtros" : "Nenhum lead ainda"}
            description={
              filtrando
                ? "Tente outro termo, ou limpe os filtros para ver a lista inteira."
                : "Conecte o WhatsApp em Integrações e os leads aparecem aqui assim que a primeira mensagem chegar."
            }
            action={
              filtrando ? (
                <Link
                  href="/leads"
                  className="focus-ring inline-flex h-10 items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ink transition-all duration-200 hover:border-ink/25"
                >
                  Limpar filtros
                </Link>
              ) : (
                <Link
                  href="/integrations/whatsapp"
                  className="focus-ring inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-canvas transition-all duration-200 hover:shadow-card active:scale-[0.97]"
                >
                  Conectar WhatsApp
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="surface overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line/70">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">Lead</th>
                  <th className="hidden px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute sm:table-cell">
                    Origem
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">Estágio</th>
                  <th className="hidden px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute md:table-cell">
                    Receita
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
                    Último contato
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => (
                  <tr
                    key={lead.id}
                    className="group border-b border-line/40 transition-colors last:border-0 hover:bg-ink/[0.025]"
                  >
                    <td className="px-5 py-3.5">
                      {/*
                        O link cobre a célula inteira, não só o texto do nome:
                        um alvo de clique do tamanho da palavra obriga mira, e
                        a linha inteira já parece clicável.
                      */}
                      <Link href={`/leads/${lead.id}`} className="focus-ring -m-1 block rounded-lg p-1">
                        <span className="block font-medium text-ink transition-colors group-hover:text-accent">
                          {lead.name ?? "Sem nome"}
                        </span>
                        <span className="block text-[12.5px] tabular-nums text-ink-mute">{lead.normalizedPhone}</span>
                      </Link>
                    </td>
                    <td className="hidden px-5 py-3.5 text-[13px] text-ink-soft sm:table-cell">
                      {attributionSourceLabel(lead.attribution)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS[lead.status].tom}>{STATUS[lead.status].rotulo}</Badge>
                        {/* Descartado acompanha o estágio, não o substitui:
                            "estava qualificado quando desistiu" diz mais. */}
                        {lead.disqualifiedAt ? <Badge tone="neutral">Descartado</Badge> : null}
                      </div>
                    </td>
                    <td className="hidden px-5 py-3.5 text-right tabular-nums text-ink-soft md:table-cell">
                      {lead.sale ? formatCentsAsBRL(lead.sale.amountCents) : ""}
                    </td>
                    <td
                      className="px-5 py-3.5 text-right text-[13px] text-ink-mute"
                      title={dataCompleta(lead.lastContactAt)}
                    >
                      {tempoRelativo(lead.lastContactAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ultimaPagina > 1 ? (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-[13px] text-ink-mute">
                Página {pagina} de {ultimaPagina}
              </p>
              <div className="flex gap-2">
                {pagina > 1 ? (
                  <Link
                    href={linkPagina(pagina - 1)}
                    className="focus-ring inline-flex h-9 items-center rounded-full border border-line bg-panel px-4 text-[13px] font-medium text-ink transition-all duration-200 hover:border-ink/25 active:scale-95"
                  >
                    Anterior
                  </Link>
                ) : null}
                {pagina < ultimaPagina ? (
                  <Link
                    href={linkPagina(pagina + 1)}
                    className="focus-ring inline-flex h-9 items-center rounded-full border border-line bg-panel px-4 text-[13px] font-medium text-ink transition-all duration-200 hover:border-ink/25 active:scale-95"
                  >
                    Próxima
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
