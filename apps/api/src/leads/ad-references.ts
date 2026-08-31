/**
 * Os ids da Meta que apontam para o anúncio de origem de um lead.
 *
 * Eles chegam por dois caminhos diferentes, e é por isso que extrair isto
 * merece uma função própria em vez de um acesso solto na tela:
 *
 * - `TRACKING_LINK` guarda o clique inteiro, com colunas estruturadas.
 * - `CTWA_REFERRAL` não tem clique nenhum — a Meta entrega o `sourceId` do
 *   anúncio no próprio referral da mensagem, e ele fica no JSON de evidência.
 */
export interface AdIds {
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
}

export interface AttributionLike {
  evidence: unknown;
  trackingClick: { campaignId: string | null; adsetId: string | null; adId: string | null } | null;
}

/** Lê uma chave do JSON de evidência sem confiar no formato dele. */
function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function extractAdIds(attribution: AttributionLike | null | undefined): AdIds {
  if (!attribution) {
    return { campaignId: null, adsetId: null, adId: null };
  }

  const click = attribution.trackingClick;
  const evidence = attribution.evidence;

  // A coluna do clique vem primeiro por ser dado estruturado; a evidência é
  // um JSON livre, usado como complemento — e como única fonte no CTWA.
  return {
    campaignId: click?.campaignId ?? readString(evidence, "campaignId"),
    adsetId: click?.adsetId ?? readString(evidence, "adsetId"),
    adId: click?.adId ?? readString(evidence, "adId"),
  };
}

export interface AdReference {
  externalId: string;
  /** Null quando a integração ainda não sincronizou este id — a tela mostra o id cru. */
  name: string | null;
}

export interface AdReferences {
  campaign: AdReference | null;
  adSet: AdReference | null;
  ad: AdReference | null;
}
