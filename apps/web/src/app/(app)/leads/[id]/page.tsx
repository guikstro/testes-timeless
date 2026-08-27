import { notFound } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { attributionCampaignLabel, attributionSourceLabel, AttributionSummary } from "@/lib/attribution";
import { formatCentsAsBRL } from "@/lib/currency";
import { ManualEditForm } from "./manual-edit-form";
import { ReplyBox } from "./reply-box";

interface WhatsAppConnectionSummary {
  provider: "CLOUD_API" | "EVOLUTION";
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
}

/**
 * Responder exige uma conexão por QR Code ativa. Explicar o porquê na própria
 * caixa evita o usuário digitar uma resposta e só então descobrir que ela não
 * pode sair.
 */
function replyDisabledReasonFor(connection: WhatsAppConnectionSummary | null): string | null {
  if (!connection || connection.status === "DISCONNECTED") {
    return "Conecte um número de WhatsApp para responder por aqui.";
  }
  if (connection.status === "PENDING_QR") {
    return "Leia o QR Code na tela de integrações para ativar a conexão.";
  }
  if (connection.provider !== "EVOLUTION") {
    return "Responder pela plataforma está disponível apenas na conexão por QR Code.";
  }
  return null;
}

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
  outboundStatus: "PENDING" | "SENT" | "FAILED" | null;
  sendError: string | null;
}

interface LeadDetail {
  id: string;
  name: string | null;
  normalizedPhone: string;
  rawPhone: string;
  status: "NEW" | "QUALIFIED" | "WON";
  qualifiedAt: string | null;
  wonAt: string | null;
  firstContactAt: string;
  lastContactAt: string;
  events: LeadEvent[];
  messages: Message[];
  attribution: AttributionSummary | null;
  sale: { amountCents: number | null } | null;
}

const EVENT_LABELS: Record<string, string> = {
  LEAD_CREATED: "Lead criado",
  CONVERSATION_STARTED: "Conversa iniciada",
  MESSAGE_RECEIVED: "Mensagem recebida",
  QUALIFIED: "Lead qualificado",
  SALE_DETECTED: "Venda detectada",
  REVENUE_DETECTED: "Receita registrada",
};

const STATUS_LABELS: Record<LeadDetail["status"], string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  WON: "Venda",
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

  const connection = await apiFetch<WhatsAppConnectionSummary | null>("/integrations/whatsapp");
  const replyDisabledReason = replyDisabledReasonFor(connection);

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

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Status e venda</h2>
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Status</dt>
            <dd className="text-slate-700">{STATUS_LABELS[lead.status]}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Qualificado em</dt>
            <dd className="text-slate-700">
              {lead.qualifiedAt ? new Date(lead.qualifiedAt).toLocaleString("pt-BR") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Venda em</dt>
            <dd className="text-slate-700">{lead.wonAt ? new Date(lead.wonAt).toLocaleString("pt-BR") : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Receita</dt>
            <dd className="text-slate-700">{formatCentsAsBRL(lead.sale?.amountCents)}</dd>
          </div>
        </dl>

        <p className="mb-3 text-xs text-slate-400">
          Correção manual — use apenas quando o tracking automático não capturou o estágio/valor corretamente.
        </p>
        <ManualEditForm leadId={lead.id} status={lead.status} />
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
            {lead.messages.map((message) => {
              const isOutbound = message.direction === "OUTBOUND";
              return (
                <li key={message.id} className={isOutbound ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isOutbound ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.type === "TEXT" ? message.text : "[mensagem não textual]"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(message.timestamp).toLocaleString("pt-BR")}
                      {isOutbound && message.outboundStatus === "PENDING" ? " · enviando..." : null}
                      {isOutbound && message.outboundStatus === "SENT" ? " · enviada" : null}
                    </p>
                    {isOutbound && message.outboundStatus === "FAILED" ? (
                      <p className="mt-1 text-xs text-red-600">Falha no envio: {message.sendError}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {lead.messages.length === 0 ? <li className="text-sm text-slate-400">Sem mensagens ainda.</li> : null}
          </ol>

          <ReplyBox leadId={lead.id} disabledReason={replyDisabledReason} />
        </div>
      </div>
    </div>
  );
}
