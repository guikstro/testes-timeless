/**
 * O foco do cliente decide o que ele vê: leads (WhatsApp, conversas, vendas),
 * presença local (ligações, rotas e visualizações no Google) ou os dois.
 * Quem escolhe é a equipe Timeless; a regra de quem pode ver o quê continua
 * sendo das áreas e das permissões, isto só tira do caminho o que não é do
 * negócio do cliente.
 */
export type Foco = "LEADS" | "PRESENCA_LOCAL" | "AMBOS";

/** Telas que só existem em volta do lead que chega pelo WhatsApp. */
const SO_DE_LEADS = ["/conversas", "/leads", "/links", "/integrations/whatsapp"];

export const temLeads = (foco: Foco | null | undefined) => foco !== "PRESENCA_LOCAL";
export const temPresencaLocal = (foco: Foco | null | undefined) => foco === "PRESENCA_LOCAL" || foco === "AMBOS";

export function focoMostra(foco: Foco | null | undefined, caminho: string): boolean {
  if (temLeads(foco)) return true;
  return !SO_DE_LEADS.some((tela) => caminho === tela || caminho.startsWith(`${tela}/`));
}
