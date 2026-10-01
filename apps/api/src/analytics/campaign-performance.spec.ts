import {
  agregaDesempenhoPorCampanha,
  CampanhaComGasto,
  comparaDesempenho,
  completaEntregaPelosAnuncios,
  entregaDaCampanha,
  LeadAtribuido,
  LinhaDeGasto,
} from "./campaign-performance";

function campanha(over: Partial<CampanhaComGasto> = {}): CampanhaComGasto {
  return {
    id: "c1",
    externalId: "ext-1",
    name: "Institucional",
    platform: "GOOGLE",
    status: "ACTIVE",
    criadaNaPlataformaEm: null,
    spend: [],
    ...over,
  };
}

function lead(over: Partial<LeadAtribuido> = {}): LeadAtribuido {
  return { campaignExternalId: "ext-1", qualifiedAt: null, wonAt: null, sale: null, ...over };
}

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("agregaDesempenhoPorCampanha", () => {
  it("soma as conversas que a plataforma contou e diz quando a conta está completa", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [
        campanha({
          spend: [
            { date: dia("2026-09-23"), spendCents: 500, conversasIniciadas: 2 },
            { date: dia("2026-09-24"), spendCents: 700, conversasIniciadas: 0 },
          ],
        }),
      ],
      [],
    );
    expect(campanhas[0].conversasNaPlataforma).toBe(2);
    expect(campanhas[0].conversasCompletas).toBe(true);
  });

  it("marca como piso quando parte dos dias não trouxe a contagem", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [
        campanha({
          spend: [
            { date: dia("2026-09-10"), spendCents: 500, conversasIniciadas: null },
            { date: dia("2026-09-24"), spendCents: 700, conversasIniciadas: 3 },
          ],
        }),
      ],
      [],
    );
    expect(campanhas[0].conversasNaPlataforma).toBe(3);
    expect(campanhas[0].conversasCompletas).toBe(false);
  });

  it("não afirma zero conversa quando nenhum dia trouxe a contagem", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [campanha({ spend: [{ date: dia("2026-09-10"), spendCents: 500, conversasIniciadas: null }] })],
      [],
    );
    expect(campanhas[0].conversasNaPlataforma).toBeNull();
  });

  it("leva a data de criação como dia civil, para distinguir campanhas de mesmo nome", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [campanha({ criadaNaPlataformaEm: new Date("2026-09-24T12:48:04Z"), spend: [] })],
      [],
    );
    expect(campanhas[0].criadaNaPlataformaEm).toBe("2026-09-24");
  });

  it("soma gasto, leads, vendas e receita na campanha certa", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [
        campanha({
          spend: [
            { date: dia("2026-03-01"), spendCents: 5000, conversasIniciadas: null },
            { date: dia("2026-03-02"), spendCents: 3000, conversasIniciadas: null },
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
      [campanha({ spend: [{ date: dia("2026-03-01"), spendCents: 9000, conversasIniciadas: null }] })],
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
            { date: dia("2026-03-10"), spendCents: 1000, conversasIniciadas: null },
            { date: dia("2026-03-01"), spendCents: 1000, conversasIniciadas: null },
            // Duas linhas no mesmo dia contam como um dia só.
            { date: dia("2026-03-01"), spendCents: 500, conversasIniciadas: null },
          ],
        }),
      ],
      [],
    );

    expect(campanhas[0].ativo).toEqual({ de: "2026-03-01", ate: "2026-03-10", dias: 2 });
  });

  it("separa venda sem valor da receita, para o ROAS não passar por completo", () => {
    const { campanhas } = agregaDesempenhoPorCampanha(
      [campanha({ spend: [{ date: dia("2026-03-01"), spendCents: 10000, conversasIniciadas: null }] })],
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
        campanha({ id: "c1", externalId: "ext-1", spend: [{ date: dia("2026-03-01"), spendCents: 1000, conversasIniciadas: null }] }),
        campanha({ id: "c2", externalId: "ext-2", spend: [{ date: dia("2026-03-01"), spendCents: 9000, conversasIniciadas: null }] }),
      ],
      [],
    );

    expect(campanhas.map((linha) => linha.externalId)).toEqual(["ext-2", "ext-1"]);
  });
});

describe("comparaDesempenho", () => {
  const marco = () =>
    agregaDesempenhoPorCampanha(
      [campanha({ externalId: "ext-1", name: "Institucional", spend: [{ date: dia("2026-03-01"), spendCents: 10000, conversasIniciadas: null }] })],
      [lead({ campaignExternalId: "ext-1", wonAt: dia("2026-03-05"), sale: { amountCents: 50000 } })],
    );

  it("calcula a variação da campanha que rodou nos dois períodos", () => {
    const julho = agregaDesempenhoPorCampanha(
      [campanha({ externalId: "ext-1", name: "Institucional", spend: [{ date: dia("2026-07-01"), spendCents: 20000, conversasIniciadas: null }] })],
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
      [campanha({ externalId: "ext-2", name: "Remarketing", spend: [{ date: dia("2026-07-01"), spendCents: 4000, conversasIniciadas: null }] })],
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
      [campanha({ externalId: "ext-1", name: "Institucional 2026", spend: [{ date: dia("2026-07-01"), spendCents: 1000, conversasIniciadas: null }] })],
      [],
    );

    expect(comparaDesempenho(julho, marco()).campanhas[0].nome).toBe("Institucional 2026");
  });
});

describe("entregaDaCampanha", () => {
  const linha = (over: Partial<LinhaDeGasto>): LinhaDeGasto => ({
    date: dia("2026-09-01"),
    spendCents: 10_000,
    conversasIniciadas: null,
    impressoes: null,
    cliques: null,
    ...over,
  });

  it("soma impressões e cliques e tira deles CTR, CPM e CPC", () => {
    const entrega = entregaDaCampanha([
      linha({ spendCents: 10_000, impressoes: 4_000, cliques: 80 }),
      linha({ date: dia("2026-09-02"), spendCents: 5_000, impressoes: 1_000, cliques: 20 }),
    ]);

    expect(entrega).toMatchObject({ impressoes: 5_000, cliques: 100, completa: true });
    expect(entrega.ctr).toBeCloseTo(0.02);
    // R$ 150 por 5 mil impressões: R$ 30 a cada mil.
    expect(entrega.cpmCentavos).toBe(3_000);
    // R$ 150 por 100 cliques: R$ 1,50 cada.
    expect(entrega.cpcCentavos).toBe(150);
  });

  /*
    Dividir o gasto do mês inteiro pelas impressões de metade dele dobraria o
    CPM, e a tela mostraria uma piora que não aconteceu.
  */
  it("divide cada custo só pelo gasto dos dias que trouxeram o número", () => {
    const entrega = entregaDaCampanha([
      linha({ spendCents: 10_000, impressoes: 5_000, cliques: 50 }),
      linha({ date: dia("2026-09-02"), spendCents: 10_000 }),
    ]);

    expect(entrega.cpmCentavos).toBe(2_000);
    expect(entrega.cpcCentavos).toBe(200);
    // Metade dos dias sem o número: é um piso, e a tela diz isso.
    expect(entrega.completa).toBe(false);
  });

  it("sem nenhum dia com entrega, não inventa número", () => {
    expect(entregaDaCampanha([linha({})])).toEqual({
      impressoes: null,
      cliques: null,
      completa: false,
      ctr: null,
      cpmCentavos: null,
      cpcCentavos: null,
      custoPorConversaCentavos: null,
    });
  });

  it("zero impressão é medida, mas não dá CTR nem CPM", () => {
    const entrega = entregaDaCampanha([linha({ spendCents: 0, impressoes: 0, cliques: 0 })]);
    expect(entrega).toMatchObject({ impressoes: 0, cliques: 0, ctr: null, cpmCentavos: null, cpcCentavos: null });
  });

  it("dá o custo por conversa sobre os dias que trouxeram a contagem", () => {
    const entrega = entregaDaCampanha([
      linha({ spendCents: 9_000, conversasIniciadas: 3 }),
      linha({ date: dia("2026-09-02"), spendCents: 5_000 }),
    ]);
    expect(entrega.custoPorConversaCentavos).toBe(3_000);
  });
});

describe("completaEntregaPelosAnuncios", () => {
  /*
    A Meta passou a gravar a entrega no gasto da campanha só agora. Para os
    dias antigos, a soma dos anúncios da campanha é o mesmo número.
  */
  it("preenche o dia sem entrega com a soma dos anúncios, e não toca no dia que já tem", () => {
    const [completa] = completaEntregaPelosAnuncios(
      [
        campanha({
          id: "c1",
          spend: [
            { date: dia("2026-09-01"), spendCents: 100, conversasIniciadas: null, impressoes: null, cliques: null },
            { date: dia("2026-09-02"), spendCents: 100, conversasIniciadas: null, impressoes: 900, cliques: 9 },
          ],
        }),
      ],
      new Map([
        ["c1|2026-09-01", { impressoes: 500, cliques: 5 }],
        ["c1|2026-09-02", { impressoes: 1, cliques: 1 }],
      ]),
    );

    expect(completa.spend.map((linha) => [linha.impressoes, linha.cliques])).toEqual([
      [500, 5],
      [900, 9],
    ]);
  });

  it("deixa sem número o dia que nem os anúncios têm", () => {
    const [completa] = completaEntregaPelosAnuncios(
      [campanha({ id: "c1", spend: [{ date: dia("2026-09-01"), spendCents: 100, conversasIniciadas: null, impressoes: null }] })],
      new Map(),
    );
    expect(completa.spend[0].impressoes).toBeNull();
  });
});

describe("totais de entrega", () => {
  it("somam os dias de todas as campanhas, e não a média dos custos de cada uma", () => {
    const { entrega } = agregaDesempenhoPorCampanha(
      [
        campanha({
          id: "a",
          externalId: "a",
          spend: [{ date: dia("2026-09-01"), spendCents: 1_000, conversasIniciadas: null, impressoes: 1_000, cliques: 10 }],
        }),
        campanha({
          id: "b",
          externalId: "b",
          spend: [{ date: dia("2026-09-01"), spendCents: 99_000, conversasIniciadas: null, impressoes: 9_000, cliques: 90 }],
        }),
      ],
      [],
    );

    // R$ 1.000 por 10 mil impressões: R$ 100 por mil. A média dos dois CPMs
    // (R$ 10 e R$ 110) daria R$ 60.
    expect(entrega.cpmCentavos).toBe(10_000);
    expect(entrega.ctr).toBeCloseTo(0.01);
  });

  it("levam o objetivo da campanha para a tela", () => {
    const { campanhas } = agregaDesempenhoPorCampanha([campanha({ objetivo: "OUTCOME_TRAFFIC" })], []);
    expect(campanhas[0].objetivo).toBe("OUTCOME_TRAFFIC");
  });
});
