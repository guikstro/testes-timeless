import { intervaloDoMes, leIntervalo, mesAnterior, mesDoIntervalo, rotuloDoIntervalo } from "./periodo";

describe("intervaloDoMes", () => {
  it("cobre o mês inteiro", () => {
    expect(intervaloDoMes(2026, 3)).toEqual({ de: "2026-03-01", ate: "2026-03-31" });
  });

  it("acerta fevereiro em ano comum e em bissexto", () => {
    expect(intervaloDoMes(2026, 2).ate).toBe("2026-02-28");
    expect(intervaloDoMes(2028, 2).ate).toBe("2028-02-29");
  });
});

describe("mesDoIntervalo", () => {
  it("reconhece um mês inteiro", () => {
    expect(mesDoIntervalo({ de: "2026-07-01", ate: "2026-07-31" })).toEqual({ ano: 2026, mes: 7 });
  });

  it("recusa um recorte que não fecha o mês", () => {
    // Chamar de "julho" um intervalo que cobre metade dele seria uma legenda
    // falsa, e a tela cairia em cima dela para escrever o cabeçalho.
    expect(mesDoIntervalo({ de: "2026-07-01", ate: "2026-07-15" })).toBeNull();
  });
});

describe("mesAnterior", () => {
  it("volta o ano ao sair de janeiro", () => {
    expect(mesAnterior(2026, 1)).toEqual({ ano: 2025, mes: 12 });
  });
});

describe("rotuloDoIntervalo", () => {
  it("nomeia o mês quando o intervalo é o mês inteiro", () => {
    expect(rotuloDoIntervalo({ de: "2026-03-01", ate: "2026-03-31" })).toBe("Março de 2026");
  });

  it("mostra as duas datas quando não é", () => {
    expect(rotuloDoIntervalo({ de: "2026-03-01", ate: "2026-03-10" })).toBe("01/03/2026 a 10/03/2026");
  });
});

describe("leIntervalo", () => {
  it("aceita um intervalo válido", () => {
    expect(leIntervalo("2026-03-01", "2026-03-31")).toEqual({ de: "2026-03-01", ate: "2026-03-31" });
  });

  it("recusa data inexistente, ordem invertida e lixo", () => {
    expect(leIntervalo("2026-02-31", "2026-03-01")).toBeNull();
    expect(leIntervalo("2026-03-31", "2026-03-01")).toBeNull();
    expect(leIntervalo("ontem", "hoje")).toBeNull();
    expect(leIntervalo(undefined, "2026-03-01")).toBeNull();
  });
});
