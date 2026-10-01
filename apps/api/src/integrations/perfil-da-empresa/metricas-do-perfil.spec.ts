import { linhasDaResposta, RespostaDasMetricas } from "./metricas-do-perfil";

const serie = (dailyMetric: string, pontos: [string, string | undefined][]) => ({
  dailyMetric,
  timeSeries: {
    datedValues: pontos.map(([dia, value]) => {
      const [year, month, day] = dia.split("-").map(Number);
      return { date: { year, month, day }, ...(value === undefined ? {} : { value }) };
    }),
  },
});

describe("os números do Perfil da Empresa", () => {
  it("dia sem valor é zero, e o valor em texto vira número", () => {
    const resposta: RespostaDasMetricas = {
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            serie("CALL_CLICKS", [
              ["2026-09-01", "3"],
              ["2026-09-02", undefined],
            ]),
            serie("BUSINESS_DIRECTION_REQUESTS", [
              ["2026-09-01", "12"],
              ["2026-09-02", "7"],
            ]),
          ],
        },
      ],
    };
    const { linhas, ultimoComNumero } = linhasDaResposta(resposta);
    expect(linhas).toEqual([
      { metrica: "LIGACOES", dia: "2026-09-01", valor: 3 },
      { metrica: "LIGACOES", dia: "2026-09-02", valor: 0 },
      { metrica: "ROTAS", dia: "2026-09-01", valor: 12 },
      { metrica: "ROTAS", dia: "2026-09-02", valor: 7 },
    ]);
    expect(ultimoComNumero).toBe("2026-09-02");
  });

  it("o último dia com número é o fim do que o Google já contou", () => {
    const { ultimoComNumero } = linhasDaResposta({
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            serie("BUSINESS_IMPRESSIONS_MOBILE_MAPS", [
              ["2026-09-27", "40"],
              ["2026-09-28", "38"],
              ["2026-09-29", undefined],
              ["2026-09-30", undefined],
            ]),
          ],
        },
      ],
    });
    expect(ultimoComNumero).toBe("2026-09-28");
  });

  it("ignora métrica que não é guardada, ponto mensal e valor estranho", () => {
    const { linhas, ultimoComNumero } = linhasDaResposta({
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            serie("BUSINESS_FOOD_ORDERS", [["2026-09-01", "5"]]),
            { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 9 }, value: "90" }] } },
            serie("WEBSITE_CLICKS", [["2026-09-03", "abc"]]),
          ],
        },
      ],
    });
    expect(linhas).toEqual([]);
    expect(ultimoComNumero).toBeNull();
  });

  it("resposta vazia não quebra", () => {
    expect(linhasDaResposta({})).toEqual({ linhas: [], ultimoComNumero: null });
  });
});
