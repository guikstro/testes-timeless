import { diaCivilLocal, fimDoDia, hojeLocal, inicioDoDia } from "./tempo";

describe("dias civis no fuso de Brasília", () => {
  it("começa o dia às três da manhã em UTC", () => {
    expect(inicioDoDia("2026-07-01").toISOString()).toBe("2026-07-01T03:00:00.000Z");
  });

  it("fecha o dia já dentro do dia seguinte em UTC", () => {
    expect(fimDoDia("2026-07-31").toISOString()).toBe("2026-08-01T02:59:59.999Z");
  });

  it("coloca as últimas horas da noite no dia certo", () => {
    // O defeito que motivou este módulo: 23h de 31 de julho em Brasília já é
    // 1 de agosto em UTC, e o lead ia parar no mês seguinte.
    expect(diaCivilLocal(new Date("2026-08-01T02:00:00.000Z"))).toBe("2026-07-31");
  });

  it("mantém o dia quando o instante está no meio da tarde", () => {
    expect(diaCivilLocal(new Date("2026-07-15T18:00:00.000Z"))).toBe("2026-07-15");
  });

  it("a janela de um mês cobre o mês inteiro sem sobra nem falta", () => {
    const de = inicioDoDia("2026-02-01");
    const ate = fimDoDia("2026-02-28");
    expect(diaCivilLocal(de)).toBe("2026-02-01");
    expect(diaCivilLocal(ate)).toBe("2026-02-28");
    // Um milissegundo depois já é o primeiro dia de março.
    expect(diaCivilLocal(new Date(ate.getTime() + 1))).toBe("2026-03-01");
  });

  it("hojeLocal usa o fuso, não o relógio do contêiner", () => {
    expect(hojeLocal(new Date("2026-01-01T01:30:00.000Z"))).toBe("2025-12-31");
  });
});
