import {
  agregaDesempenhoPorCampanha,
  CampanhaComGasto,
  comparaDesempenho,
  LeadAtribuido,
} from "./campaign-performance";

function campanha(over: Partial<CampanhaComGasto> = {}): CampanhaComGasto {
  return {
    id: "c1",
    externalId: "ext-1",
    name: "Institucional",
    platform: "GOOGLE",
    spend: [],
    ...over,
  };
}

function lead(over: Partial<LeadAtribuido> = {}): LeadAtribuido {
  return { campaignExternalId: "ext-1", qualifiedAt: null, wonAt: null, sale: null, ...over };
}

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("agregaDesempenhoPorCampanha", () => {
  it("soma gasto, leads, vendas e receita na campanha certa", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [
        campanha({
          spend: [
            { date: dia("2026-03-01"), spendCents: 5000 },
            { date: dia("2026-03-02"), spendCents: 3000 },
          ],
        }),
        campanha({ id: "c2", externalId: "ext-2", name: "Remarketing" }),
      ],
      [
        lead({ qualifiedAt: dia("2026-03-02") }),
        lead({ qualifiedAt: dia("2026-03-03"), wonAt: dia("2026-03-05"), sale: { amountCents: 40000 } }),
        lead({ campaignExternalId: "ext-2" }),
      ],
    );

    const institucional = campanhas.find((linha) => linha.externalId === "ext-1")!;
    expect(institucional.gastoCentavos).toBe(8000);
    expect(institucional.leads).toBe(2);
    expect(institucional.qualificados).toBe(2);
    expect(institucional.vendas).toBe(1);
    expect(institucional.receitaCentavos).toBe(40000);
    expect(institucional.custoPorLeadCentavos).toBe(4000);
    expect(institucional.custoPorVendaCentavos).toBe(8000);
    expect(institucional.roas).toBe(5);
  });

  it("mantém a campanha que gastou sem trazer nenhum lead", () => {
    // A linha mais acionável da tabela: dinheiro saiu, nada voltou. Some-la
    // esconderia justamente a campanha que precisa ser cortada.
    const { campanhas } = agregaDesempenhoPorCampanha(
      [campanha({ spend: [{ date: dia("2026-03-01"), spendCents: 9000 }] })],
      [],
    );

    expect(campanhas).toHaveLength(1);
    expect(campanhas[0].gastoCentavos).toBe(9000);
    expect(campanhas[0].leads).toBe(0);
    // Sem lead não há custo por lead: zero afirmaria eficiência onde houve
    // desperdício, e a divisão por zero não tem resposta.
    expect(campanhas[0].custoPorLeadCentavos).toBeNull();
    // O ROAS, ao contrário, é medível: gastou e não voltou nada. Zero aqui é
    // uma constatação verdadeira, não uma lacuna disfarçada.
    expect(campanhas[0].roas).toBe(0);
  });

  it("não calcula custo por lead quando o gasto ainda não foi lançado", () => {
    const { campanhas } = agregaDesempenhoPorCampanha([campanha()], [lead(), lead()]);

    expect(campanhas[0].leads).toBe(2);
    expect(campanhas[0].gastoCentavos).toBe(0);
    expect(campanhas[0].custoPorLeadCentavos).toBeNull();
    expect(campanhas[0].ativo).toBeNull();
  });

  it("descreve o período ativo pelos dias com gasto, não pelo intervalo corrido", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [
        campanha({
          spend: [
            { date: dia("2026-03-10"), spendCents: 1000 },
            { date: dia("2026-03-01"), spendCents: 1000 },
            // Duas linhas no mesmo dia contam como um dia só.
            { date: dia("2026-03-01"), spendCents: 500 },
          ],
        }),
      ],
      [],
    );

    expect(campanhas[0].ativo).toEqual({ de: "2026-03-01", ate: "2026-03-10", dias: 2 });
  });

  it("separa venda sem valor da receita, para o ROAS não passar por completo", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [campanha({ spend: [{ date: dia("2026-03-01"), spendCents: 10000 }] })],
      [
        lead({ wonAt: dia("2026-03-02"), sale: { amountCents: 30000 } }),
        lead({ wonAt: dia("2026-03-03"), sale: { amountCents: null } }),
        lead({ wonAt: dia("2026-03-04"), sale: null }),
      ],
    );

    expect(campanhas[0].vendas).toBe(3);
    expect(campanhas[0].receitaCentavos).toBe(30000);
    expect(campanhas[0].vendasSemValor).toBe(2);
    expect(campanhas[0].roas).toBe(3);
  });

  it("conta à parte o lead que nenhuma campanha reivindica", () => {
    const { campanhas, semCampanha } = agregaDesempenhoPorCampanha(
      [campanha()],
      [
        lead(),
        lead({ campaignExternalId: null }),
        // Id que não corresponde a campanha nenhuma desta organização: pode
        // ser de uma campanha ainda não sincronizada, e somá-lo a uma linha
        // qualquer seria inventar origem.
        lead({ campaignExternalId: "ext-desconhecido" }),
      ],
    );

    expect(campanhas[0].leads).toBe(1);
    expect(semCampanha).toBe(2);
  });

  it("ordena pelo maior gasto", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [
        campanha({ id: "c1", externalId: "ext-1", spend: [{ date: dia("2026-03-01"), spendCents: 1000 }] }),
        campanha({ id: "c2", externalId: "ext-2", spend: [{ date: dia("2026-03-01"), spendCents: 9000 }] }),
      ],
      [],
    );

    expect(campanhas.map((linha) => linha.externalId)).toEqual(["ext-2", "ext-1"]);
  });
});

describe("comparaDesempenho", () => {
  const marco = () =>
    agregaDesempenhoPorCampanha(
      [campanha({ externalId: "ext-1", name: "Institucional", spend: [{ date: dia("2026-03-01"), spendCents: 10000 }] })],
      [lead({ campaignExternalId: "ext-1", wonAt: dia("2026-03-05"), sale: { amountCents: 50000 } })],
    );

  it("calcula a variação da campanha que rodou nos dois períodos", () => {
    const julho = agregaDesempenhoPorCampanha(
      [campanha({ externalId: "ext-1", name: "Institucional", spend: [{ date: dia("2026-07-01"), spendCents: 20000 }] })],
      [lead({ campaignExternalId: "ext-1" }), lead({ campaignExternalId: "ext-1" })],
    );

    const { campanhas } = comparaDesempenho(julho, marco());

    expect(campanhas).toHaveLength(1);
    expect(campanhas[0].variacao!.gastoCentavos).toEqual({ delta: 1, anterior: 10000 });
    expect(campanhas[0].variacao!.leads).toEqual({ delta: 1, anterior: 1 });
    // Gastou o dobro, trouxe o dobro de leads e nenhuma venda: a queda de
    // receita é o que a comparação existe para mostrar.
    expect(campanhas[0].variacao!.receitaCentavos).toEqual({ delta: -1, anterior: 50000 });
  });

  it("mostra a campanha que existe só num dos períodos, sem zerá-la no outro", () => {
    const julho = agregaDesempenhoPorCampanha(
      [campanha({ externalId: "ext-2", name: "Remarketing", spend: [{ date: dia("2026-07-01"), spendCents: 4000 }] })],
      [],
    );

    const { campanhas } = comparaDesempenho(julho, marco());

    const remarketing = campanhas.find((linha) => linha.externalId === "ext-2")!;
    const institucional = campanhas.find((linha) => linha.externalId === "ext-1")!;

    expect(remarketing.anterior).toBeNull();
    expect(institucional.atual).toBeNull();
    // Sem os dois lados não há proporção a calcular: "não rodou" não é uma
    // queda de cem por cento, é ausência.
    expect(remarketing.variacao).toBeNull();
    expect(institucional.variacao).toBeNull();
    // Quem rodou no período escolhido vem antes de quem só aparece no histórico.
    expect(campanhas.map((linha) => linha.externalId)).toEqual(["ext-2", "ext-1"]);
  });

  it("usa o nome do período atual quando a campanha foi renomeada", () => {
    const julho = agregaDesempenhoPorCampanha(
      [campanha({ externalId: "ext-1", name: "Institucional 2026", spend: [{ date: dia("2026-07-01"), spendCents: 1000 }] })],
      [],
    );

    expect(comparaDesempenho(julho, marco()).campanhas[0].nome).toBe("Institucional 2026");
  });
});
