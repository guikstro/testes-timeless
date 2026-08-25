import { notFound } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { attributionCampaignLabel, attributionSourceLabel, AttributionSummary } from "@/lib/attribution";

interface LeadEvent {
  id: string;
  type: string;
  occurredAt: string;
  metadata: unknown;
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "OTHER";
  text: string | null;
  timestamp: string;
}

interface LeadDetail {
  id: string;
  name: string | null;
  normalizedPhone: string;
  rawPhone: string;
  status: string;
  firstContactAt: string;
  lastContactAt: string;
  events: LeadEvent[];
  messages: Message[];
  attribution: AttributionSummary | null;
}

const EVENT_LABELS: Record<string, string> = {
  LEAD_CREATED: "Lead criado",
  CONVERSATION_STARTED: "Conversa iniciada",
  MESSAGE_RECEIVED: "Mensagem recebida",
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let lead: LeadDetail;
  try {
    lead = await apiFetch<LeadDetail>(`/leads/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">{lead.name ?? "Sem nome"}</h1>
      <p className="mb-6 text-sm text-slate-500">{lead.normalizedPhone}</p>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Origem</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Origem</dt>
            <dd className="text-slate-700">{attributionSourceLabel(lead.attribution)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Campanha</dt>
            <dd className="text-slate-700">{attributionCampaignLabel(lead.attribution)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Confiança</dt>
            <dd className="text-slate-700">{lead.attribution?.confidence === "HIGH" ? "Alta" : "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Timeline</h2>
          <ol className="space-y-3">
            {lead.events.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="text-slate-400">{new Date(event.occurredAt).toLocaleString("pt-BR")}</span>{" "}
                <span className="text-slate-700">— {EVENT_LABELS[event.type] ?? event.type}</span>
              </li>
            ))}
            {lead.events.length === 0 ? <li className="text-sm text-slate-400">Sem eventos ainda.</li> : null}
          </ol>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Conversa</h2>
          <ol className="space-y-3">
            {lead.messages.map((message) => (
              <li key={message.id} className="text-sm">
                <span className="text-slate-400">{new Date(message.timestamp).toLocaleString("pt-BR")}</span>{" "}
                <span className="text-slate-700">
                  — {message.type === "TEXT" ? message.text : "[mensagem não textual]"}
                </span>
              </li>
            ))}
            {lead.messages.length === 0 ? <li className="text-sm text-slate-400">Sem mensagens ainda.</li> : null}
          </ol>
        </div>
      </div>
    </div>
  );
}
