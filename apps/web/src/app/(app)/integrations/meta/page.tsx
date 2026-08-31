import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { ConnectMetaForm } from "./connect-form";
import { ConnectionActions } from "./connection-actions";
import { ConnectMetaCapiForm } from "./capi-connect-form";

interface MetaConnection {
  id: string;
  adAccountId: string;
  status: "CONNECTED" | "DISCONNECTED" | "TOKEN_EXPIRED" | "SYNC_FAILED";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
  pixelId: string | null;
  hasCapiAccessToken: boolean;
  capiConfiguredAt: string | null;
}

type ConversionEventType = "LEAD" | "QUALIFIED_LEAD" | "PURCHASE";
type ConversionEventStatus = "PENDING" | "SENT" | "RETRYING" | "FAILED";

interface ConversionEvent {
  id: string;
  type: ConversionEventType;
  status: ConversionEventStatus;
  valueCents: number | null;
  currency: string | null;
  occurredAt: string;
  sentAt: string | null;
  lastError: string | null;
  lead: { id: string; name: string | null; normalizedPhone: string };
}

const EVENT_TYPE_LABELS: Record<ConversionEventType, string> = {
  LEAD: "Lead",
  QUALIFIED_LEAD: "Lead qualificado",
  PURCHASE: "Venda",
};

const EVENT_STATUS_LABELS: Record<ConversionEventStatus, string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  RETRYING: "Tentando novamente",
  FAILED: "Falhou",
};

const EVENT_STATUS_COLORS: Record<ConversionEventStatus, string> = {
  PENDING: "text-slate-500",
  SENT: "text-emerald-600",
  RETRYING: "text-amber-600",
  FAILED: "text-red-600",
};

interface Ad {
  id: string;
  name: string;
  status: string;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  ads: Ad[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  lastSyncedAt: string;
  totalSpendCents: number;
  adSets: AdSet[];
}

const STATUS_LABELS: Record<MetaConnection["status"], string> = {
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  TOKEN_EXPIRED: "Token expirado",
  SYNC_FAILED: "Falha na sincronização",
};

const STATUS_COLORS: Record<MetaConnection["status"], string> = {
  CONNECTED: "text-emerald-600",
  DISCONNECTED: "text-slate-500",
  TOKEN_EXPIRED: "text-red-600",
  SYNC_FAILED: "text-red-600",
};

export default async function MetaIntegrationPage() {
  const connection = await apiFetch<MetaConnection | null>("/integrations/meta");
  const campaigns = connection ? await apiFetch<Campaign[]>("/campaigns") : [];
  const conversionEvents = connection
    ? await apiFetch<{ items: ConversionEvent[]; total: number }>("/integrations/meta/conversion-events?limit=20")
    : { items: [], total: 0 };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Meta Ads</h1>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
        {connection ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Status:</span>{" "}
              <span className={STATUS_COLORS[connection.status]}>{STATUS_LABELS[connection.status]}</span>
            </p>
            <p>
              <span className="font-medium">Ad Account:</span> {connection.adAccountId}
            </p>
            <p>
              <span className="font-medium">Última sincronização:</span>{" "}
              {connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString("pt-BR") : "Nunca"}
            </p>
            {connection.lastSyncError ? (
              <p className="text-red-600">
                <span className="font-medium">Erro:</span> {connection.lastSyncError}
              </p>
            ) : null}
            {connection.status === "TOKEN_EXPIRED" ? (
              <p className="text-sm text-slate-500">
                A conexão com a Meta precisa ser renovada. Reconecte com um access token válido abaixo.
              </p>
            ) : null}
            <ConnectionActions />
          </div>
        ) : (
          <p className="text-sm text-slate-600">Nenhuma conta de anúncio conectada ainda.</p>
        )}
      </div>

      <ConnectMetaForm />

      {connection ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Campanhas sincronizadas</h2>
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
              Nenhuma campanha sincronizada ainda. Clique em &quot;Sincronizar agora&quot;.
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium text-slate-900">{campaign.name}</p>
                    <p className="text-sm text-slate-500">
                      {campaign.status} · Investimento (30d): {formatCentsAsBRL(campaign.totalSpendCents)}
                    </p>
                  </div>
                  {campaign.adSets.map((adSet) => (
                    <div key={adSet.id} className="ml-4 mt-2 border-l border-slate-100 pl-4">
                      <p className="text-sm text-slate-700">
                        {adSet.name} <span className="text-slate-400">{adSet.status}</span>
                      </p>
                      {adSet.ads.map((ad) => (
                        <p key={ad.id} className="ml-4 text-xs text-slate-500">
                          {ad.name} · {ad.status}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {connection ? (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Meta Conversions API</h2>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            {connection.hasCapiAccessToken ? (
              <p>
                <span className="font-medium">Configurado</span> · Pixel ID {connection.pixelId} · enviando eventos de
                Lead, Lead qualificado e Venda automaticamente.
              </p>
            ) : (
              <p className="text-slate-600">
                Ainda não configurado. Informe o Pixel ID e o access token do Conversions API para começar a enviar
                eventos de Lead, Lead qualificado e Venda de volta para a Meta.
              </p>
            )}
          </div>
          <ConnectMetaCapiForm />

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Eventos enviados</h3>
            {conversionEvents.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
                Nenhum evento registrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Lead</th>
                      <th className="px-4 py-2">Evento</th>
                      <th className="px-4 py-2">Valor</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Ocorrido em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversionEvents.items.map((event) => (
                      <tr key={event.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2">{event.lead.name ?? event.lead.normalizedPhone}</td>
                        <td className="px-4 py-2">{EVENT_TYPE_LABELS[event.type]}</td>
                        <td className="px-4 py-2">{formatCentsAsBRL(event.valueCents)}</td>
                        <td className={`px-4 py-2 ${EVENT_STATUS_COLORS[event.status]}`}>
                          {EVENT_STATUS_LABELS[event.status]}
                          {event.lastError ? <span className="block text-xs text-slate-400">{event.lastError}</span> : null}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{new Date(event.occurredAt).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
