export interface AttributionSummary {
  method: "CTWA_REFERRAL" | "TRACKING_LINK" | "UNKNOWN";
  confidence: "HIGH" | "NONE";
  evidence: Record<string, unknown> | null;
}

/** Human-readable "Origem" — see docs/ATTRIBUTION.md for what each method actually proves. */
export function attributionSourceLabel(attribution: AttributionSummary | null | undefined): string {
  if (!attribution || attribution.method === "UNKNOWN") return "Desconhecida";
  if (attribution.method === "CTWA_REFERRAL") return "Anúncio Meta (Click-to-WhatsApp)";
  const utmSource = attribution.evidence?.utmSource;
  return typeof utmSource === "string" && utmSource ? utmSource : "Link rastreável";
}

/** Human-readable "Campanha". */
export function attributionCampaignLabel(attribution: AttributionSummary | null | undefined): string {
  if (!attribution) return "—";
  if (attribution.method === "CTWA_REFERRAL") {
    const headline = attribution.evidence?.headline;
    const adId = attribution.evidence?.adId;
    return (typeof headline === "string" && headline) || (typeof adId === "string" && adId) || "—";
  }
  if (attribution.method === "TRACKING_LINK") {
    const utmCampaign = attribution.evidence?.utmCampaign;
    return typeof utmCampaign === "string" && utmCampaign ? utmCampaign : "—";
  }
  return "—";
}

/** Como a origem foi provada — ver docs/ATTRIBUTION.md. */
export function attributionMethodLabel(method: AttributionSummary["method"] | undefined): string {
  if (method === "CTWA_REFERRAL") return "Referral da Meta (Click-to-WhatsApp)";
  if (method === "TRACKING_LINK") return "Link rastreável";
  return "Sem evidência";
}

/**
 * Rótulo grosseiro de dispositivo a partir do user agent.
 *
 * Deliberadamente simples: o que importa aqui é "veio do celular ou do
 * computador", e um parser completo de user agent seria uma dependência nova
 * para uma precisão que ninguém vai usar nesta tela.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "—";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("linux")) return "Linux";
  return "Outro";
}
