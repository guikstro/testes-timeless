import { MetricasDaApi } from "./metricas-da-api";

describe("MetricasDaApi", () => {
  const base = Date.UTC(2026, 8, 28, 12, 0, 0);

  it("conta pedidos e erros e calcula a taxa e os percentis", () => {
    const m = new MetricasDaApi();
    for (let i = 1; i <= 100; i++) m.anota(i, i <= 5 ? 500 : 200, base + i * 100);

    const r = m.resumo(base + 20_000);
    expect(r.pedidos).toBe(100);
    expect(r.erros).toBe(5);
    expect(r.taxaDeErro).toBeCloseTo(0.05);
    expect(r.p50Ms).toBe(51);
    expect(r.p95Ms).toBe(96);
  });

  it("guarda só a última hora", () => {
    const m = new MetricasDaApi();
    m.anota(10, 200, base);
    m.anota(10, 200, base + 61 * 60_000);

    const r = m.resumo(base + 61 * 60_000);
    expect(r.pedidos).toBe(1);
    expect(r.porMinuto).toHaveLength(1);
  });

  it("sem pedidos, não inventa número", () => {
    expect(new MetricasDaApi().resumo(base)).toMatchObject({ pedidos: 0, taxaDeErro: null, p50Ms: null, p95Ms: null });
  });
});
