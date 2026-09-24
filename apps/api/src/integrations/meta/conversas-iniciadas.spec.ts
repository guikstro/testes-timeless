import { ACAO_CONVERSA_INICIADA, conversasIniciadasDe, dataDaMeta } from "./conversas-iniciadas";

describe("conversasIniciadasDe", () => {
  it("lê o número de conversas iniciadas entre as outras ações", () => {
    expect(
      conversasIniciadasDe([
        { action_type: "link_click", value: "15" },
        { action_type: ACAO_CONVERSA_INICIADA, value: "3" },
        { action_type: "onsite_conversion.messaging_first_reply", value: "2" },
      ]),
    ).toBe(3);
  });

  it("dá zero quando a Meta não devolve o tipo, porque ela só devolve o que aconteceu", () => {
    expect(conversasIniciadasDe([{ action_type: "link_click", value: "4" }])).toBe(0);
    expect(conversasIniciadasDe([])).toBe(0);
    expect(conversasIniciadasDe(undefined)).toBe(0);
  });

  it("não inventa conversa a partir de valor mal formado", () => {
    expect(conversasIniciadasDe([{ action_type: ACAO_CONVERSA_INICIADA, value: "abc" }])).toBe(0);
    expect(conversasIniciadasDe([{ action_type: ACAO_CONVERSA_INICIADA, value: "-2" }])).toBe(0);
  });
});

describe("dataDaMeta", () => {
  it("lê o fuso sem dois pontos que a Meta usa", () => {
    expect(dataDaMeta("2026-09-24T12:48:04+0000")?.toISOString()).toBe("2026-09-24T12:48:04.000Z");
    expect(dataDaMeta("2026-09-24T09:48:04-0300")?.toISOString()).toBe("2026-09-24T12:48:04.000Z");
  });

  it("devolve null em vez de uma data falsa", () => {
    expect(dataDaMeta(undefined)).toBeNull();
    expect(dataDaMeta("ontem")).toBeNull();
  });
});
