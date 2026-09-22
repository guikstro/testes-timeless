import { encontraCodigo, geraCodigo, geraLote, hashDoCodigo, normaliza, QUANTIDADE } from "./codigos-de-recuperacao";

describe("códigos de recuperação", () => {
  it("gera o lote completo, sem repetir", () => {
    const lote = geraLote();
    expect(lote).toHaveLength(QUANTIDADE);
    expect(new Set(lote).size).toBe(QUANTIDADE);
  });

  it("usa formato legível em dois grupos", () => {
    expect(geraCodigo()).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{5}-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/);
  });

  /*
    Um código de recuperação é transcrito à mão, meses depois, com pressa.
    Cada ambiguidade vira uma pessoa trancada fora da conta achando que o
    código não presta.
  */
  it("não usa caracteres que se confundem no papel", () => {
    const juntos = Array.from({ length: 50 }, geraCodigo).join("");
    for (const ambiguo of ["0", "O", "1", "I", "L", "2", "Z", "5", "S", "8", "B"]) {
      expect(juntos).not.toContain(ambiguo);
    }
  });

  describe("normalização", () => {
    it("aceita como a pessoa digita", () => {
      const codigo = geraCodigo();
      const digitado = ` ${codigo.toLowerCase().replace("-", " ")} `;

      // Recusar por formatação seria recusar por outra coisa que não o segredo.
      expect(normaliza(digitado)).toBe(normaliza(codigo));
      expect(hashDoCodigo(digitado)).toBe(hashDoCodigo(codigo));
    });
  });

  describe("encontraCodigo", () => {
    const codigos = geraLote(3);
    const guardados = codigos.map((c) => ({ codeHash: hashDoCodigo(c), usadoEm: null as Date | null }));

    it("acha o código apresentado", () => {
      expect(encontraCodigo(guardados, codigos[1])).toBe(guardados[1]);
    });

    it("acha mesmo digitado de qualquer jeito", () => {
      expect(encontraCodigo(guardados, codigos[2].toLowerCase().replace("-", ""))).toBe(guardados[2]);
    });

    it("não acha código que não está na lista", () => {
      expect(encontraCodigo(guardados, geraCodigo())).toBeNull();
    });

    it("não aceita código já usado", () => {
      // Uso único por definição. Aceitar de novo daria ao papel perdido a
      // mesma validade do papel guardado.
      const usados = [{ codeHash: hashDoCodigo(codigos[0]), usadoEm: new Date() }];
      expect(encontraCodigo(usados, codigos[0])).toBeNull();
    });

    it("não estoura com a lista vazia", () => {
      expect(encontraCodigo([], geraCodigo())).toBeNull();
    });
  });
});
