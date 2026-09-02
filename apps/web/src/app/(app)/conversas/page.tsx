import { apiFetch } from "@/lib/api-client";
import { Caixa } from "@/lib/conversas/tipos";
import { InboxView } from "./inbox-view";

interface ConexaoDoWhatsApp {
  provider: "CLOUD_API" | "EVOLUTION";
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
}

/**
 * Mesma regra da ficha do lead: responder exige uma conexão por QR Code ativa.
 * Explicar o porquê na própria caixa evita a pessoa escrever uma resposta e só
 * então descobrir que ela não pode sair.
 */
function motivoParaNaoResponder(conexao: ConexaoDoWhatsApp | null): string | null {
  if (!conexao || conexao.status === "DISCONNECTED") {
    return "Conecte um número de WhatsApp para responder por aqui.";
  }
  if (conexao.status === "PENDING_QR") {
    return "Leia o QR Code na tela de integrações para ativar a conexão.";
  }
  if (conexao.provider !== "EVOLUTION") {
    return "Responder pela plataforma está disponível apenas na conexão por QR Code.";
  }
  return null;
}

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead } = await searchParams;

  // A primeira lista vem do servidor para a tela abrir preenchida; daí em
  // diante quem manda é o cliente, que troca de conversa sem recarregar.
  const [caixa, conexao] = await Promise.all([
    apiFetch<Caixa>("/conversations"),
    apiFetch<ConexaoDoWhatsApp | null>("/integrations/whatsapp"),
  ]);

  return (
    <InboxView
      caixaInicial={caixa}
      motivoParaNaoResponder={motivoParaNaoResponder(conexao)}
      leadInicial={typeof lead === "string" && lead ? lead : null}
    />
  );
}
