import { situacaoDaVerba } from "./calculo-da-verba";

/** Meio-dia de Brasília, para o dia civil não depender da hora do teste. */
const HOJE = new Date("2026-09-21T15:00:00.000Z");

function verba(over: Partial<Parameters<typeof situacaoDaVerba>[0]> = {}) {
  return {
    amountCents: 500_000, // R$ 5.000
    startsOn: new Date("2026-09-01T00:00:00.000Z"),
    endsOn: new Date("2026-09-30T00:00:00.000Z"),
    ...over,
  };
}

describe("situacaoDaVerba", () => {
  it("mostra o que entrou, o que saiu e o que sobra", () => {
    const s = situacaoDaVerba(verba(), 200_000, HOJE);

    expect(s.gastoCentavos).toBe(200_000);
    expect(s.saldoCentavos).toBe(300_000);
    expect(s.consumidoPorCento).toBe(40);
  });

  /*
    As datas de verba são dia civil sem hora, e o Prisma as devolve à
    meia-noite UTC. Convertê-las para o fuso de Brasília as jogaria um dia
    para trás, porque meia-noite em UTC é nove da noite do dia anterior aqui.
  */
  it("não desloca as datas de calendário em um dia", () => {
    const s = situacaoDaVerba(verba(), 0, HOJE);

    expect(s.de).toBe("2026-09-01");
    expect(s.ate).toBe("2026-09-30");
  });

  it("conta o dia de hoje entre os corridos", () => {
    // Do dia 1 ao dia 21 são vinte e um dias, não vinte: no primeiro dia já
    // se gastou um dia de verba.
    expect(situacaoDaVerba(verba(), 0, HOJE).diasCorridos).toBe(21);
  });

  it("conta os dias que ainda faltam sem incluir hoje", () => {
    expect(situacaoDaVerba(verba(), 0, HOJE).diasRestantes).toBe(9);
  });

  describe("ritmo e projeção", () => {
    /*
      O princípio que separa este produto: zero é uma medida, ausência de
      medida é null. Com ritmo zero, a projeção diria que a verba dura para
      sempre, o que é uma mentira com cara de precisão.
    */
    it("não inventa ritmo enquanto nada foi gasto", () => {
      const s = situacaoDaVerba(verba(), 0, HOJE);

      expect(s.ritmoDiarioCentavos).toBeNull();
      expect(s.acabaEm).toBeNull();
    });

    it("tira a média pelos dias corridos", () => {
      // R$ 2.100 em vinte e um dias são R$ 100 por dia.
      expect(situacaoDaVerba(verba(), 210_000, HOJE).ritmoDiarioCentavos).toBe(10_000);
    });

    it("diz em que dia o saldo acaba no ritmo atual", () => {
      // R$ 2.100 gastos, R$ 2.900 de saldo, R$ 100 por dia: vinte e nove dias.
      expect(situacaoDaVerba(verba(), 210_000, HOJE).acabaEm).toBe("2026-10-20");
    });

    it("não projeta fim quando a verba já acabou", () => {
      const s = situacaoDaVerba(verba(), 500_000, HOJE);

      expect(s.saldoCentavos).toBe(0);
      expect(s.acabaEm).toBeNull();
    });

    it("mostra o ritmo que faria a verba durar até o fim combinado", () => {
      // R$ 2.900 de saldo para nove dias.
      const s = situacaoDaVerba(verba(), 210_000, HOJE);

      // Sem esta referência, "cem reais por dia" não diz se é rápido ou
      // devagar: depende de quanto tempo falta.
      expect(s.ritmoIdealCentavos).toBe(32_222);
    });
  });

  describe("casos que a tela precisa aguentar", () => {
    it("assume o estouro em vez de esconder", () => {
      const s = situacaoDaVerba(verba(), 620_000, HOJE);

      // Um saldo negativo é um fato. Cortar em zero faria a tela dizer que
      // está tudo certo no mês em que o cliente gastou a mais.
      expect(s.saldoCentavos).toBe(-120_000);
      expect(s.consumidoPorCento).toBe(124);
      expect(s.acabaEm).toBeNull();
    });

    it("aceita verba que vale até acabar, sem fim declarado", () => {
      const s = situacaoDaVerba(verba({ endsOn: null }), 210_000, HOJE);

      expect(s.ate).toBeNull();
      expect(s.diasRestantes).toBeNull();
      // Sem fim declarado não há ritmo ideal, mas a projeção continua valendo.
      expect(s.ritmoIdealCentavos).toBeNull();
      expect(s.acabaEm).toBe("2026-10-20");
    });

    it("não divide por zero numa verba que começa hoje", () => {
      const s = situacaoDaVerba(verba({ startsOn: new Date("2026-09-21T00:00:00.000Z") }), 5_000, HOJE);

      expect(s.diasCorridos).toBe(1);
      expect(s.ritmoDiarioCentavos).toBe(5_000);
    });

    it("não divide por zero numa verba que ainda vai começar", () => {
      const s = situacaoDaVerba(verba({ startsOn: new Date("2026-10-01T00:00:00.000Z") }), 0, HOJE);

      expect(s.diasCorridos).toBe(1);
      expect(s.ritmoDiarioCentavos).toBeNull();
    });

    it("não calcula porcentagem de uma verba zerada", () => {
      // Dividir por zero daria infinito, e a tela mostraria algo sem sentido.
      expect(situacaoDaVerba(verba({ amountCents: 0 }), 0, HOJE).consumidoPorCento).toBeNull();
    });

    it("não devolve dias restantes negativos depois do fim", () => {
      const s = situacaoDaVerba(verba({ endsOn: new Date("2026-09-10T00:00:00.000Z") }), 100_000, HOJE);

      expect(s.diasRestantes).toBe(0);
      expect(s.ritmoIdealCentavos).toBeNull();
    });
  });
});
