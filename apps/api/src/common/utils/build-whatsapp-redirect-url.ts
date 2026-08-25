const WHATSAPP_HOSTS = new Set(["wa.me", "api.whatsapp.com"]);

/**
 * If (and only if) `destinationUrl` is a wa.me / api.whatsapp.com link,
 * embeds `[ref:<token>]` into its prefilled `text=` parameter, appending to
 * whatever greeting was already there rather than replacing it. This is the
 * one deliberate exception to "never rewrite the destination URL"
 * (docs/TRACKING.md) — it's not blind UTM-appending, it's using WhatsApp's
 * own supported prefill mechanism to carry a click reference across the
 * gap where no cookie survives (docs/ATTRIBUTION.md).
 *
 * Any other destination is returned completely unchanged.
 */
export function buildWhatsAppRedirectUrl(destinationUrl: string, attributionToken: string): string {
  let url: URL;
  try {
    url = new URL(destinationUrl);
  } catch {
    return destinationUrl;
  }

  if (!WHATSAPP_HOSTS.has(url.hostname)) {
    return destinationUrl;
  }

  const marker = `[ref:${attributionToken}]`;
  const existingText = url.searchParams.get("text");
  url.searchParams.set("text", existingText ? `${existingText} ${marker}` : `Olá! ${marker}`);

  return url.toString();
}
