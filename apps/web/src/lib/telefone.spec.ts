import { formataTelefone } from "./telefone";

describe("formataTelefone", () => {
  it("formata celular e fixo brasileiros", () => {
    expect(formataTelefone("+5585999998888")).toBe("(85) 99999-8888");
    expect(formataTelefone("+558533334444")).toBe("(85) 3333-4444");
  });

  it("deixa como veio o que não é número brasileiro", () => {
    expect(formataTelefone("+14155550123")).toBe("+14155550123");
    expect(formataTelefone("")).toBe("");
    expect(formataTelefone(null)).toBe("");
  });
});
