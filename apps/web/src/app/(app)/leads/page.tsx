import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { attributionCampaignLabel, attributionSourceLabel, AttributionSummary } from "@/lib/attribution";
import { formatCentsAsBRL } from "@/lib/currency";

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

const STATUS_LABELS: Record<LeadListItem["status"], string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  MEETING_SCHEDULED: "Reunião marcada",
  WON: "Venda",
};

export default async function LeadsPage() {
  const { items } = await apiFetch<PaginatedResult<LeadListItem>>("/leads?limit=50");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Leads</h1>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center text-sm text-ink-soft">
          Nenhum lead ainda. Conecte o WhatsApp em Integrações para começar a capturar conversas.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-mute">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium">Campanha</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Receita</th>
                <th className="px-4 py-3 font-medium">Primeiro contato</th>
                <th className="px-4 py-3 font-medium">Último contato</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id} className="border-b border-line/60 last:border-0 hover:bg-panel-soft">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-ink hover:underline">
                      {lead.name ?? "Sem nome"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{lead.normalizedPhone}</td>
                  <td className="px-4 py-3 text-ink-soft">{attributionSourceLabel(lead.attribution)}</td>
                  <td className="px-4 py-3 text-ink-soft">{attributionCampaignLabel(lead.attribution)}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {STATUS_LABELS[lead.status]}
                    {/* Desqualificado não substitui o estágio: mostra os dois, porque
                        "estava qualificado quando desistiu" diz mais que só "descartado". */}
                    {lead.disqualifiedAt ? (
                      <span className="ml-2 rounded bg-panel-soft px-1.5 py-0.5 text-xs text-ink-mute">
                        desqualificado
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatCentsAsBRL(lead.sale?.amountCents)}</td>
                  <td className="px-4 py-3 text-ink-mute">
                    {new Date(lead.firstContactAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-ink-mute">{new Date(lead.lastContactAt).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
