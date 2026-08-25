function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive, word-boundary-aware match — deliberately not a naive
 * `.includes()` (which would also match "recontratado" for the trigger
 * "contrato"), but this still cannot disambiguate meaning: a configured
 * phrase like "contrato fechado" will also match inside "o contrato fechado
 * ainda não chegou" (Section 108). Word-boundary matching is the safety
 * this implementation actually provides; negation/tense disambiguation is a
 * probabilistic NLP problem explicitly out of scope for the RULE classifier
 * (Section 62) — see docs/QUALIFICATION.md. Operators should choose
 * distinctive, multi-word phrases to keep the false-positive rate low.
 */
export function matchesTriggerPhrase(text: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i");
  return pattern.test(text);
}
