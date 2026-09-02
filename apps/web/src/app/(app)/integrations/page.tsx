import { apiFetch } from "@/lib/api-client";
import { tempoRelativo } from "@/lib/relative-time";
import { COR_DA_MARCA, LogoGoogleAds, LogoMeta, LogoWhatsApp } from "./logos";
import { Cartao, Tom } from "./integration-card";

interface ConexaoWhatsApp {
  provider: "CLOUD_API" | "EVOLUTION";
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
}

interface ConexaoMeta {
  adAccountId: string;
  status: "CONNECTED" | "DISCONNECTED" | "TOKEN_EXPIRED" | "SYNC_FAILED";
  lastSyncedAt: string | null;
}

interface CampanhaDoGoogle {
  id: string;
}

/**
 * Nenhuma das três consultas pode derrubar a página.
 *
 * Esta tela existe justamente para dizer o que está fora do ar, e seria um
 * contrassenso ela mesma sumir quando uma integração falha. Falhou, aparece
 * como desconhecida.
 */
async function busca<T>(caminho: string): Promise<T | null> {
  try {
    return await apiFetch<T>(caminho);
  } catch {
    return null;
  }
}

export default async function IntegrationsPage() {
  const [whatsapp, meta, campanhasDoGoogle] = await Promise.all([
    busca<ConexaoWhatsApp | null>("/integrations/whatsapp"),
    busca<ConexaoMeta | null>("/integrations/meta"),
    busca<CampanhaDoGoogle[]>("/campaigns?platform=GOOGLE"),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Integrações</h1>
      <p className="mb-6 mt-1 text-corpo text-ink-mute">
        De onde os leads chegam e de onde vem o gasto que os produziu.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Cartao
          href="/integrations/whatsapp"
          nome="WhatsApp"
          descricao="Conecte um número para capturar e responder leads dentro da plataforma."
          cor={COR_DA_MARCA.whatsapp}
          logo={<LogoWhatsApp />}
          {...estadoDoWhatsApp(whatsapp)}
        />

        <Cartao
          href="/integrations/meta"
          nome="Meta Ads"
          descricao="Sincronize campanhas, conjuntos, anúncios e investimento."
          cor={COR_DA_MARCA.meta}
          logo={<LogoMeta />}
          {...estadoDoMeta(meta)}
        />

        <Cartao
          href="/integrations/google"
          nome="Google Ads"
          descricao="Registre campanhas e o gasto diário para medir custo por lead."
          cor={COR_DA_MARCA.google}
          logo={<LogoGoogleAds />}
          {...estadoDoGoogle(campanhasDoGoogle)}
        />
      </div>
    </div>
  );
}

function estadoDoWhatsApp(conexao: ConexaoWhatsApp | null): { rotulo: string; tom: Tom; detalhe: string } {
  if (!conexao) {
    return { rotulo: "Não conectado", tom: "neutral", detalhe: "Nenhum lead entra sem esta conexão" };
  }
  if (conexao.status === "CONNECTED") {
    const via = conexao.provider === "EVOLUTION" ? "QR Code" : "Cloud API";
    return { rotulo: "Conectado", tom: "success", detalhe: `Conectado por ${via}` };
  }
  if (conexao.status === "PENDING_QR") {
    return { rotulo: "Aguardando", tom: "warning", detalhe: "Leia o QR Code para ativar" };
  }
  return { rotulo: "Fora do ar", tom: "danger", detalhe: "Nenhum lead está entrando agora" };
}

function estadoDoMeta(conexao: ConexaoMeta | null): { rotulo: string; tom: Tom; detalhe: string } {
  if (!conexao) {
    return { rotulo: "Não conectado", tom: "neutral", detalhe: "Sem gasto do Meta no relatório" };
  }
  if (conexao.status === "TOKEN_EXPIRED") {
    return { rotulo: "Token expirado", tom: "danger", detalhe: "Reconecte para voltar a sincronizar" };
  }
  if (conexao.status === "SYNC_FAILED") {
    return { rotulo: "Falha na sincronia", tom: "danger", detalhe: "O gasto pode estar desatualizado" };
  }
  if (conexao.status === "DISCONNECTED") {
    return { rotulo: "Desconectado", tom: "neutral", detalhe: `Conta ${conexao.adAccountId}` };
  }
  return {
    rotulo: "Conectado",
    tom: "success",
    // Quando foi a última vez importa mais que o fato de estar conectado: uma
    // conexão viva que parou de sincronizar mente do mesmo jeito.
    detalhe: conexao.lastSyncedAt
      ? `Sincronizado ${tempoRelativo(conexao.lastSyncedAt)}`
      : "Ainda não sincronizou",
  };
}

function estadoDoGoogle(campanhas: CampanhaDoGoogle[] | null): { rotulo: string; tom: Tom; detalhe: string } {
  if (campanhas === null) {
    return { rotulo: "Desconhecido", tom: "neutral", detalhe: "Não foi possível consultar agora" };
  }
  if (campanhas.length === 0) {
    return { rotulo: "Sem campanhas", tom: "neutral", detalhe: "Lance uma campanha para medir o custo" };
  }
  return {
    rotulo: "Em uso",
    tom: "success",
    detalhe: `${campanhas.length} ${campanhas.length === 1 ? "campanha registrada" : "campanhas registradas"}`,
  };
}
