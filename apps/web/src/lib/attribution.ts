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
