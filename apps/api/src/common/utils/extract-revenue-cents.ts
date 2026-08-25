/**
 * Best-effort extraction of a monetary value from free-text Portuguese,
 * returned in cents (never float — Section 48). Returns null when nothing
 * matches with reasonable confidence rather than guessing (Section 109):
 * the caller (ConversationClassifierService) must leave the sale's amount
 * unset and let a human fill it in manually when this returns null.
 *
 * Handles, in order:
 *   1. "R$ 1.500,50" / "R$1500" / "R$ 50"  — explicit currency, most reliable
 *   2. "2 mil" / "2,5 mil"                  — informal thousands
 *   3. "2000 reais" / "150,90 reais"        — explicit unit, no currency sign
 */
export function extractRevenueCents(text: string): number | null {
  const currencyMatch = text.match(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/i);
  if (currencyMatch) {
    const integerPart = currencyMatch[1].replace(/\./g, "");
    const centsPart = (currencyMatch[2] ?? "0").padEnd(2, "0").slice(0, 2);
    return Number(integerPart) * 100 + Number(centsPart);
  }

  const milMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*mil\b/i);
  if (milMatch) {
    const value = Number(milMatch[1].replace(",", "."));
    return Math.round(value * 1000 * 100);
  }

  const reaisMatch = text.match(/\b(\d+(?:[.,]\d{1,2})?)\s*reais\b/i);
  if (reaisMatch) {
    const value = Number(reaisMatch[1].replace(",", "."));
    return Math.round(value * 100);
  }

  return null;
}
