import { gastoPorDia, picoDiario } from "./gasto-por-dia";

const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe("gastoPorDia", () => {
  it("soma as linhas do mesmo dia e acumula o período", () => {
    const dias = gastoPorDia(
      [
        { date: dia("2026-09-01"), spendCents: 10_000 },
        { date: dia("2026-09-01"), spendCents: 5_000 },
        { date: dia("2026-09-03"), spendCents: 2_000 },
      ],
      { de: "2026-09-01", ate: "2026-09-03" },
      "2026-09-03",
    );

    expect(dias).toEqual([
      { dia: "2026-09-01", gastoCentavos: 15_000, acumuladoCentavos: 15_000 },
      // Dia passado sem linha é zero de verdade: a sincronia cobriu e não achou gasto.
      { dia: "2026-09-02", gastoCentavos: 0, acumuladoCentavos: 15_000 },
      { dia: "2026-09-03", gastoCentavos: 2_000, acumuladoCentavos: 17_000 },
    ]);
  });

  /*
    A distinção que o arquivo inteiro existe para manter: um dia que ainda não
    chegou não gastou zero. Barra zerada no resto do mês diria que o anúncio
    parou, quando o que houve é que o dia não aconteceu.
  */
  it("deixa sem número o dia que ainda não aconteceu", () => {
    const dias = gastoPorDia([{ date: dia("2026-09-01"), spendCents: 8_000 }], { de: "2026-09-01", ate: "2026-09-04" }, "2026-09-02");

    expect(dias.map((d) => d.gastoCentavos)).toEqual([8_000, 0, null, null]);
    expect(dias.map((d) => d.acumuladoCentavos)).toEqual([8_000, 8_000, null, null]);
  });

  it("mantém o mês inteiro na série mesmo com hoje no começo dele", () => {
    // Encolher a série esconderia quanto tempo ainda falta, que é metade da
    // pergunta de quem olha uma verba.
    const dias = gastoPorDia([], { de: "2026-09-01", ate: "2026-09-30" }, "2026-09-02");

    expect(dias).toHaveLength(30);
    expect(dias[29].dia).toBe("2026-09-30");
  });

  it("ignora gasto fora da janela pedida", () => {
    const dias = gastoPorDia(
      [
        { date: dia("2026-08-31"), spendCents: 99_000 },
        { date: dia("2026-09-01"), spendCents: 1_000 },
      ],
      { de: "2026-09-01", ate: "2026-09-01" },
      "2026-09-01",
    );

    expect(dias).toEqual([{ dia: "2026-09-01", gastoCentavos: 1_000, acumuladoCentavos: 1_000 }]);
  });

  it("aceita janela de um dia só", () => {
    expect(gastoPorDia([], { de: "2026-09-10", ate: "2026-09-10" }, "2026-09-10")).toHaveLength(1);
  });

  /*
    Datas de gasto são dia civil à meia-noite UTC. Lê-las em Brasília as joga
    um dia para trás, e o primeiro dia do mês cairia no mês anterior.
  */
  it("não desloca o dia por fuso", () => {
    const dias = gastoPorDia([{ date: dia("2026-09-01"), spendCents: 500 }], { de: "2026-09-01", ate: "2026-09-01" }, "2026-09-01");

    expect(dias[0].dia).toBe("2026-09-01");
    expect(dias[0].gastoCentavos).toBe(500);
  });
});

describe("picoDiario", () => {
  it("acha o maior gasto de um dia", () => {
    const dias = gastoPorDia(
      [
        { date: dia("2026-09-01"), spendCents: 3_000 },
        { date: dia("2026-09-02"), spendCents: 9_000 },
      ],
      { de: "2026-09-01", ate: "2026-09-03" },
      "2026-09-03",
    );

    expect(picoDiario(dias)).toBe(9_000);
  });

  it("devolve zero quando não houve gasto nenhum", () => {
    expect(picoDiario(gastoPorDia([], { de: "2026-09-01", ate: "2026-09-02" }, "2026-09-02"))).toBe(0);
  });
});
