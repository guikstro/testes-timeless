import { custoPor, diasDa, janelas } from "./calculo";

describe("presença local: contas", () => {
  it("a janela anterior tem o mesmo tamanho e encosta na atual", () => {
    expect(janelas("2026-09-29", 30)).toEqual({
      atual: { de: "2026-08-31", ate: "2026-09-29" },
      anterior: { de: "2026-08-01", ate: "2026-08-30" },
    });
  });

  it("custo por ação só existe com ação", () => {
    expect(custoPor(10_000, 4)).toBe(2_500);
    expect(custoPor(10_000, 0)).toBeNull();
    expect(custoPor(10_000, null)).toBeNull();
    expect(custoPor(null, 3)).toBeNull();
  });

  it("lista todos os dias, inclusive virando o mês", () => {
    expect(diasDa({ de: "2026-08-30", ate: "2026-09-02" })).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });
});
