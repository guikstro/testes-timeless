import { apiFetch } from "@/lib/api-client";
import { ConnectWhatsAppForm } from "./connect-form";
import { DisconnectButton } from "./disconnect-button";
import { QrConnect } from "./qr-connect";

interface WhatsAppConnection {
  id: string;
  provider: "CLOUD_API" | "EVOLUTION";
  phoneNumberId: string | null;
  instanceName: string | null;
  displayPhoneNumber: string | null;
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
  hasAccessToken: boolean;
  connectedAt: string;
  disconnectedAt: string | null;
  lastEventAt: string | null;
}

const STATUS_LABELS: Record<WhatsAppConnection["status"], string> = {
  PENDING_QR: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
};

const STATUS_COLORS: Record<WhatsAppConnection["status"], string> = {
  PENDING_QR: "text-amber-600",
  CONNECTED: "text-emerald-600",
  DISCONNECTED: "text-slate-500",
};

const PROVIDER_LABELS: Record<WhatsAppConnection["provider"], string> = {
  CLOUD_API: "Cloud API (oficial da Meta)",
  EVOLUTION: "QR Code",
};

export default async function WhatsAppIntegrationPage() {
  const connection = await apiFetch<WhatsAppConnection | null>("/integrations/whatsapp");
  const isConnected = connection?.status === "CONNECTED";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">WhatsApp</h1>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
        {connection ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Status:</span>{" "}
              <span className={STATUS_COLORS[connection.status]}>{STATUS_LABELS[connection.status]}</span>
            </p>
            <p>
              <span className="font-medium">Forma de conexão:</span> {PROVIDER_LABELS[connection.provider]}
            </p>
            <p>
              <span className="font-medium">Número:</span> {connection.displayPhoneNumber ?? "Aguardando leitura do QR"}
            </p>
            <p>
              <span className="font-medium">Última mensagem recebida:</span>{" "}
              {connection.lastEventAt ? new Date(connection.lastEventAt).toLocaleString("pt-BR") : "Nenhuma ainda"}
            </p>
            {connection.status !== "DISCONNECTED" ? (
              <div className="pt-2">
                <DisconnectButton />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Nenhum número conectado ainda.</p>
        )}
      </div>

      {isConnected ? null : (
        <div className="space-y-6">
          <QrConnect alreadyPending={connection?.status === "PENDING_QR"} />

          <details className="rounded-xl border border-slate-200 bg-white p-6">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Conectar pela Cloud API oficial da Meta
            </summary>
            <p className="mb-4 mt-2 text-sm text-slate-500">
              Alternativa sem risco de bloqueio, mas exige um número já verificado no Meta for Developers e a
              configuração manual do webhook. Só recebe mensagens. O envio pela plataforma está disponível apenas na
              conexão por QR Code.
            </p>
            <ConnectWhatsAppForm />
          </details>
        </div>
      )}
    </div>
  );
}
