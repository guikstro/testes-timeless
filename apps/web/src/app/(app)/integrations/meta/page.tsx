import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { ConnectMetaForm } from "./connect-form";
import { ConnectionActions } from "./connection-actions";

interface MetaConnection {
  id: string;
  adAccountId: string;
  status: "CONNECTED" | "DISCONNECTED" | "TOKEN_EXPIRED" | "SYNC_FAILED";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
}

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
                A conexão com a Meta precisa ser renovada — reconecte com um access token válido abaixo.
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
                        {adSet.name} <span className="text-slate-400">— {adSet.status}</span>
                      </p>
                      {adSet.ads.map((ad) => (
                        <p key={ad.id} className="ml-4 text-xs text-slate-500">
                          {ad.name} — {ad.status}
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
    </div>
  );
}
