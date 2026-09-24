import { OrigemDosLeads } from "@prisma/client";

/**
 * O que a primeira mensagem prova sobre de onde a pessoa veio.
 *
 * - ANUNCIO: clicou num anúncio pago. Na Meta, a própria mensagem traz o
 *   anúncio; no Google, e na Meta com anúncio que leva a um site, é o clique
 *   num link rastreável com a marca de mídia paga.
 * - LINK: clicou num link rastreável que não é de mídia paga, como a bio do
 *   Instagram ou um e-mail.
 * - NENHUMA: escreveu direto, sem prova de origem.
 */
export type OrigemDaMensagem = "ANUNCIO" | "LINK" | "NENHUMA";

/** O clique que gerou a mensagem, quando ela veio por link rastreável. */
export interface CliqueDeOrigem {
  utmMedium: string | null;
  gclid: string | null;
  fbclid: string | null;
  ctwaClid: string | null;
  campaignId: string | null;
  adId: string | null;
}

/**
 * Os meios que o mercado usa para mídia paga. Comparados sem caixa, porque
 * "CPC" e "cpc" chegam dos dois jeitos.
 */
const MEIOS_PAGOS = new Set(["cpc", "ppc", "cpm", "paid", "paid_social", "paidsocial", "paid-social", "display"]);

export function origemDaMensagem({
  anuncioDaMeta,
  clique,
}: {
  /** A mensagem trouxe a marca de anúncio da própria Meta. */
  anuncioDaMeta: boolean;
  clique: CliqueDeOrigem | null;
}): OrigemDaMensagem {
  if (anuncioDaMeta) return "ANUNCIO";
  if (!clique) return "NENHUMA";

  // O identificador de clique é posto pela própria plataforma no anúncio, e
  // é a prova mais forte de mídia paga que um link pode carregar. O id de
  // campanha ou de anúncio vem do modelo de URL configurado no anúncio.
  const temIdDePlataforma = Boolean(
    clique.gclid || clique.fbclid || clique.ctwaClid || clique.campaignId || clique.adId,
  );
  const meioPago = clique.utmMedium !== null && MEIOS_PAGOS.has(clique.utmMedium.trim().toLowerCase());

  return temIdDePlataforma || meioPago ? "ANUNCIO" : "LINK";
}

/** Se um primeiro contato com esta origem vira lead, pela regra da organização. */
export function viraLead(regra: OrigemDosLeads, origem: OrigemDaMensagem): boolean {
  if (regra === "TODOS") return true;
  if (regra === "RASTREADO") return origem !== "NENHUMA";
  return origem === "ANUNCIO";
}
