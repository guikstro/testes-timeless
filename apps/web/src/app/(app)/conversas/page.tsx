import { apiFetch } from "@/lib/api-client";
import { AvisoDeMedicao } from "@/components/aviso-de-medicao";
import { conexaoDoWhatsApp, ConexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { hojeEmBrasilia, inicioDaMedicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { Caixa } from "@/lib/conversas/tipos";
import { InboxView } from "./inbox-view";


/**
 * Mesma regra da ficha do lead: responder exige uma conexão por QR Code ativa.
 * Explicar o porquê na própria caixa evita a pessoa escrever uma resposta e só
 * então descobrir que ela não pode sair.
 */
function motivoParaNaoResponder(conexao: ConexaoDoWhatsApp | null | undefined): string | null {
  // Sem saber o estado, não se inventa motivo: a própria tentativa de envio
  // diz se deu certo.
  if (conexao === undefined) return null;
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
  const [caixa, conexao] = await Promise.all([apiFetch<Caixa>("/conversations"), conexaoDoWhatsApp()]);

  /*
    Caixa vazia e sem WhatsApp: a caixa de entrada em branco, com "nenhuma
    conversa ainda" num canto, parecia uma tela quebrada. O que falta dizer é
    por que ela está vazia e o que fazer, e isso ocupa a tela no lugar dela.
  */
  const medicao = medicaoDeLeads({ conexao, ate: hojeEmBrasilia(), leads: caixa.total });
  if (medicao !== "medido") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Conversas</h1>
        <p className="mb-6 mt-1 text-corpo text-ink-mute">
          As conversas do WhatsApp conectado, para responder sem sair do sistema.
        </p>
        <AvisoDeMedicao medicao={medicao} desde={conexao ? inicioDaMedicao(conexao) : null} />
      </div>
    );
  }

  return (
    <InboxView
      caixaInicial={caixa}
      motivoParaNaoResponder={motivoParaNaoResponder(conexao)}
      leadInicial={typeof lead === "string" && lead ? lead : null}
    />
  );
}
