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
 * `leadMessage` (opcional) é a mensagem pré-preenchida que a landing page
 * montou com as respostas da triagem; quando vem, ela substitui o `text=`
 * cadastrado no link. Ver `sanitizeLeadMessage`.
 *
 * Any other destination is returned completely unchanged.
 */
export function buildWhatsAppRedirectUrl(
  destinationUrl: string,
  attributionToken: string,
  leadMessage?: string,
): string {
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
  if (leadMessage) {
    // Mensagem montada pela landing page (triagem): substitui o texto fixo do
    // link, e o token vai numa linha própria no fim.
    url.searchParams.set("text", `${leadMessage}\n\n${marker}`);
  } else {
    url.searchParams.set("text", existingText ? `${existingText} ${marker}` : `Olá! ${marker}`);
  }

  return url.toString();
}

const LEAD_MESSAGE_MAX_LENGTH = 800;

/**
 * `text` chega pela query string pública do `/r/:code`, então é entrada não
 * confiável. Mantém só texto simples (quebra de linha sim, demais caracteres de
 * controle não) e limita o tamanho. O destino continua sendo o do link
 * cadastrado, então isso não vira redirecionamento aberto.
 */
export function sanitizeLeadMessage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .trim()
    .slice(0, LEAD_MESSAGE_MAX_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
