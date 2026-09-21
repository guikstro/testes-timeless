import { agregaDesempenhoPorAnuncio, GastoDoAnuncio, LeadDoAnuncio } from "./desempenho-por-anuncio";

function gasto(over: Partial<GastoDoAnuncio> = {}): GastoDoAnuncio {
  return {
    adId: "interno-1",
    externalId: "ad1",
    name: "Vídeo 01",
    status: "ACTIVE",
    campanha: "Direito Trabalhista",
    spendCents: 34_000,
    impressions: 1200,
    clicks: 48,
    ...over,
  };
}

function lead(over: Partial<LeadDoAnuncio> = {}): LeadDoAnuncio {
  return { adExternalId: "ad1", qualifiedAt: null, wonAt: null, sale: null, ...over };
}

describe("agregaDesempenhoPorAnuncio", () => {
  it("junta o que o anúncio custou com o que ele trouxe", () => {
    const { anuncios } = agregaDesempenhoPorAnuncio(
      [gasto()],
      [lead(), lead({ qualifiedAt: new Date() }), lead({ wonAt: new Date(), sale: { amountCents: 200_000 } })],
    );

    expect(anuncios[0]).toMatchObject({
      leads: 3,
      qualificados: 1,
      vendas: 1,
      receitaCentavos: 200_000,
      gastoCentavos: 34_000,
    });
  });

  it("calcula custo por lead e por cliente", () => {
    const { anuncios } = agregaDesempenhoPorAnuncio(
      [gasto({ spendCents: 34_000 })],
      [lead(), lead(), lead({ wonAt: new Date(), sale: { amountCents: 100_000 } })],
    );

    // É esta conta que faz desligar um criativo na segunda-feira em vez de
    // desligar a campanha inteira no fim do mês.
    expect(anuncios[0].custoPorLeadCentavos).toBe(11_333);
    expect(anuncios[0].custoPorVendaCentavos).toBe(34_000);
  });

  describe("o que é medida e o que é ausência de medida", () => {
    it("não chama de caro o anúncio que não trouxe lead nenhum", () => {
      const { anuncios } = agregaDesempenhoPorAnuncio([gasto()], []);

      // Dividir por zero não dá um custo alto, dá um custo desconhecido.
      expect(anuncios[0].leads).toBe(0);
      expect(anuncios[0].custoPorLeadCentavos).toBeNull();
      expect(anuncios[0].custoPorVendaCentavos).toBeNull();
    });

    it("trata retorno zero como resultado, e falta de gasto como impossível de saber", () => {
      const semRetorno = agregaDesempenhoPorAnuncio([gasto()], [lead()]).anuncios[0];
      const semGasto = agregaDesempenhoPorAnuncio([gasto({ spendCents: 0 })], [lead()]).anuncios[0];

      // Gastou e não voltou nada é um fato: zero.
      expect(semRetorno.retorno).toBe(0);
      // Sem gasto, a conta não existe.
      expect(semGasto.retorno).toBeNull();
    });
  });

  /*
    Lead cujo anúncio não aparece nos gastos é contado à parte, nunca
    empurrado para dentro de outra linha.

    Acontece de verdade quando o anúncio foi apagado da conta, ou quando o
    clique veio sem identificação de anúncio. Distribuir esses leads inflaria
    o desempenho de um criativo que não os trouxe, que é exatamente o tipo de
    dedução que este produto recusa.
  */
  it("separa o lead sem anúncio conhecido em vez de atribuí-lo a alguém", () => {
    const resultado = agregaDesempenhoPorAnuncio(
      [gasto()],
      [lead(), lead({ adExternalId: "apagado" }), lead({ adExternalId: null })],
    );

    expect(resultado.anuncios[0].leads).toBe(1);
    expect(resultado.semAnuncio).toBe(2);
  });

  it("ordena pelo que consome mais verba", () => {
    const { anuncios } = agregaDesempenhoPorAnuncio(
      [
        gasto({ externalId: "barato", spendCents: 1_000 }),
        gasto({ externalId: "caro", spendCents: 90_000 }),
        gasto({ externalId: "medio", spendCents: 40_000 }),
      ],
      [],
    );

    // A ordem é informação: o anúncio que consome mais verba é o que mais
    // importa acertar, mesmo quando vai bem.
    expect(anuncios.map((a) => a.externalId)).toEqual(["caro", "medio", "barato"]);
  });

  describe("totais", () => {
    it("soma o período inteiro", () => {
      const { totais } = agregaDesempenhoPorAnuncio(
        [gasto({ externalId: "a", spendCents: 30_000 }), gasto({ externalId: "b", spendCents: 20_000 })],
        [lead({ adExternalId: "a", wonAt: new Date(), sale: { amountCents: 150_000 } }), lead({ adExternalId: "b" })],
      );

      expect(totais).toMatchObject({ gastoCentavos: 50_000, leads: 2, vendas: 1, receitaCentavos: 150_000 });
    });

    it("conta quantos anúncios gastaram sem trazer nada", () => {
      const { totais } = agregaDesempenhoPorAnuncio(
        [
          gasto({ externalId: "a" }),
          gasto({ externalId: "b" }),
          // Sem gasto e sem lead não é desperdício, é anúncio que não rodou.
          gasto({ externalId: "c", spendCents: 0 }),
        ],
        [lead({ adExternalId: "a" })],
      );

      expect(totais.semRetorno).toBe(1);
    });
  });

  it("aceita período sem anúncio nenhum", () => {
    const resultado = agregaDesempenhoPorAnuncio([], []);

    expect(resultado.anuncios).toEqual([]);
    expect(resultado.totais.gastoCentavos).toBe(0);
    expect(resultado.totais.semRetorno).toBe(0);
  });
});
