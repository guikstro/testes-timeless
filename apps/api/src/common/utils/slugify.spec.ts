import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Direito Trabalhista Demo")).toBe("direito-trabalhista-demo");
  });

  it("strips accents / diacritics", () => {
    expect(slugify("Organização Ação")).toBe("organizacao-acao");
  });

  it("collapses repeated separators and trims leading/trailing hyphens", () => {
    expect(slugify("  --Multi   Word!!--  ")).toBe("multi-word");
  });

  it("removes symbols not allowed in a slug", () => {
    expect(slugify("Fulano & Cia. Ltda.")).toBe("fulano-cia-ltda");
  });
});
