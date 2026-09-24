import { cache } from "react";
import { apiFetch } from "./api-client";
import { ConexaoParaMedicao } from "./medicao-de-leads";

export interface ConexaoDoWhatsApp extends ConexaoParaMedicao {
  provider: "CLOUD_API" | "EVOLUTION";
}

/**
 * A conexão do WhatsApp desta organização, lida uma vez por requisição.
 *
 * O layout precisa dela para a faixa do topo e cada tela de números precisa
 * dela para saber se o zero é medida; com o `cache`, as duas perguntas custam
 * uma consulta só.
 *
 * Devolve undefined quando a consulta falha, e não null: null quer dizer "não
 * há WhatsApp", e dizer isso por causa de uma falha de rede faria a tela
 * mandar o cliente configurar o que já está configurado.
 */
export const conexaoDoWhatsApp = cache(async (): Promise<ConexaoDoWhatsApp | null | undefined> => {
  try {
    return await apiFetch<ConexaoDoWhatsApp | null>("/integrations/whatsapp");
  } catch {
    return undefined;
  }
});
