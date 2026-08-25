import { matchesTriggerPhrase } from "./matches-trigger-phrase";

describe("matchesTriggerPhrase", () => {
  it("matches case-insensitively", () => {
    expect(matchesTriggerPhrase("Vamos marcar sua CONSULTA amanhã", "vamos marcar sua consulta")).toBe(true);
  });

  it("matches as a substring within a larger message", () => {
    expect(matchesTriggerPhrase("oi tudo bem, vamos marcar sua consulta então?", "vamos marcar sua consulta")).toBe(
      true,
    );
  });

  it("does not match a different phrase", () => {
    expect(matchesTriggerPhrase("Fui demitido e não recebi tudo", "vamos marcar sua consulta")).toBe(false);
  });

  it("respects word boundaries — 'contrato' does not match inside 'recontratado'", () => {
    expect(matchesTriggerPhrase("Ele foi recontratado semana passada", "contrato")).toBe(false);
  });

  it("returns false for an empty/blank configured phrase instead of matching everything", () => {
    expect(matchesTriggerPhrase("qualquer mensagem", "")).toBe(false);
    expect(matchesTriggerPhrase("qualquer mensagem", "   ")).toBe(false);
  });

  it("documents the known false-positive from Section 108: a distinctive phrase still matches inside unrelated context", () => {
    // This is the spec's own example. Word-boundary matching prevents a
    // different class of false positive (partial-word matches) but cannot
    // disambiguate meaning — see the docstring in matches-trigger-phrase.ts
    // and docs/QUALIFICATION.md. Operators must pick distinctive phrases.
    expect(matchesTriggerPhrase("O contrato fechado ontem ainda não chegou.", "contrato fechado")).toBe(true);
  });
});
