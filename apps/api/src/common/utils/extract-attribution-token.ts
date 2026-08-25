const TOKEN_PATTERN = /\[ref:([A-Za-z0-9]{4,12})\]/;

/** Pulls a `[ref:XXXXXXX]` token out of an inbound message's text, if present — see build-whatsapp-redirect-url.ts. */
export function extractAttributionToken(text: string | undefined | null): string | null {
  if (!text) return null;
  return text.match(TOKEN_PATTERN)?.[1] ?? null;
}
