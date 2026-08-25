import { apiFetch } from "@/lib/api-client";
import { ConnectWhatsAppForm } from "./connect-form";
import { DisconnectButton } from "./disconnect-button";

interface WhatsAppConnection {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  status: "CONNECTED" | "DISCONNECTED";
  hasAccessToken: boolean;
  connectedAt: string;
  disconnectedAt: string | null;
  lastEventAt: string | null;
}

export default async function WhatsAppIntegrationPage() {
  const connection = await apiFetch<WhatsAppConnection | null>("/integrations/whatsapp");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">WhatsApp</h1>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
        {connection ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Status:</span>{" "}
              <span className={connection.status === "CONNECTED" ? "text-emerald-600" : "text-slate-500"}>
                {connection.status === "CONNECTED" ? "Conectado" : "Desconectado"}
              </span>
            </p>
            <p>
              <span className="font-medium">Número:</span> {connection.displayPhoneNumber}
            </p>
            <p>
              <span className="font-medium">Phone Number ID:</span> {connection.phoneNumberId}
            </p>
            <p>
              <span className="font-medium">Última sincronização:</span>{" "}
              {connection.lastEventAt ? new Date(connection.lastEventAt).toLocaleString("pt-BR") : "Nunca"}
            </p>
            {connection.status === "CONNECTED" ? (
              <div className="pt-2">
                <DisconnectButton />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Nenhum número conectado ainda.</p>
        )}
      </div>

      <ConnectWhatsAppForm />
    </div>
  );
}
