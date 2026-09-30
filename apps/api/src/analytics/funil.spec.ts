import { LeadStatus } from "@prisma/client";
import {
  aplicaFiltros,
  etapaAlcancada,
  FiltrosDoFunil,
  LeadDoFunil,
  LeadRecortavel,
  montaFunil,
  opcoesDosFiltros,
} from "./funil";

function lead(overrides: Partial<LeadDoFunil> = {}): LeadDoFunil {
  return {
    status: "NEW",
    emAtendimentoAt: null,
    respondido: false,
    disqualifiedAt: null,
    disqualifiedReason: null,
    ...overrides,
  };
}

const perdido = (status: LeadStatus, motivo: string | null = null) =>
  lead({ status, disqualifiedAt: new Date("2026-09-10T12:00:00Z"), disqualifiedReason: motivo });

function recortavel(overrides: Partial<LeadRecortavel> = {}): LeadRecortavel {
  return {
    ...lead(),
    campanhaId: null,
    origem: { key: "unknown", label: "Sem origem identificada" },
    responsavelId: null,
    ...overrides,
  };
}

const SEM_FILTRO: FiltrosDoFunil = { campanha: null, origem: null, responsavel: null };

describe("etapaAlcancada", () => {
  it("segue o estágio do lead", () => {
    expect(etapaAlcancada(lead({ status: "NEW" }))).toBe(0);
    expect(etapaAlcancada(lead({ status: "IN_PROGRESS" }))).toBe(1);
    expect(etapaAlcancada(lead({ status: "QUALIFIED" }))).toBe(2);
    expect(etapaAlcancada(lead({ status: "MEETING_SCHEDULED" }))).toBe(3);
    expect(etapaAlcancada(lead({ status: "WON" }))).toBe(4);
  });

  /*
    Todo lead anterior ao estágio "Em atendimento" continua em Novo mesmo
    tendo sido respondido. Sem a resposta como prova, o funil diria que
    ninguém daquele período foi atendido.
  */
  it("conta como contatado o lead em Novo que a equipe já respondeu", () => {
    expect(etapaAlcancada(lead({ respondido: true }))).toBe(1);
  });

  it("conta como contatado o lead que entrou em atendimento e voltou para Novo", () => {
    expect(etapaAlcancada(lead({ emAtendimentoAt: new Date("2026-09-01T12:00:00Z") }))).toBe(1);
  });

  it("não rebaixa quem já passou do contato", () => {
    expect(etapaAlcancada(lead({ status: "QUALIFIED", respondido: false }))).toBe(2);
  });
});

describe("montaFunil", () => {
  const cinco = [
    lead({ status: "NEW" }),
    lead({ status: "IN_PROGRESS" }),
    lead({ status: "QUALIFIED" }),
    lead({ status: "MEETING_SCHEDULED" }),
    lead({ status: "WON" }),
  ];

  /*
    Uma venda passou por todas as etapas de cima. Contar só o estágio atual
    diria que ninguém foi qualificado num mês em que todo mundo comprou.
  */
  it("conta em cada etapa quem chegou nela ou foi além", () => {
    const funil = montaFunil(cinco);
    expect(funil.etapas.map((etapa) => etapa.quantidade)).toEqual([5, 4, 3, 2, 1]);
    expect(funil.etapas.map((etapa) => etapa.chave)).toEqual(["leads", "contatados", "qualificados", "reuniao", "vendas"]);
  });

  it("dá a conversão de cada etapa sobre a anterior, e a total sobre os leads", () => {
    const funil = montaFunil(cinco);
    expect(funil.etapas.map((etapa) => etapa.conversao)).toEqual([null, 4 / 5, 3 / 4, 2 / 3, 1 / 2]);
    expect(funil.conversaoTotal).toBe(1 / 5);
  });

  it("não inventa taxa sem base", () => {
    const funil = montaFunil([]);
    expect(funil.etapas.map((etapa) => etapa.quantidade)).toEqual([0, 0, 0, 0, 0]);
    expect(funil.etapas.every((etapa) => etapa.conversao === null)).toBe(true);
    expect(funil.conversaoTotal).toBeNull();
  });

  it("deixa a conversão nula depois de uma etapa vazia, em vez de dividir por zero", () => {
    const funil = montaFunil([lead(), lead()]);
    expect(funil.etapas[1].conversao).toBe(0);
    expect(funil.etapas[2].conversao).toBeNull();
    expect(funil.conversaoTotal).toBe(0);
  });

  it("separa quem parou em cada etapa entre perdidos e ainda abertos", () => {
    const funil = montaFunil([
      lead(),
      perdido("NEW", "Número errado"),
      lead({ status: "QUALIFIED" }),
      perdido("QUALIFIED", "Preço"),
      perdido("QUALIFIED", "Preço"),
      lead({ status: "WON" }),
    ]);

    expect(funil.etapas.map((etapa) => [etapa.perdidos, etapa.abertos])).toEqual([
      [1, 1],
      [0, 0],
      [2, 1],
      [0, 0],
      [0, 0],
    ]);
    expect(funil.perdidos).toBe(3);
    expect(funil.abertos).toBe(2);
  });

  it("fecha a conta: quem sai de uma etapa para a seguinte é perdido ou aberto", () => {
    const funil = montaFunil([
      ...cinco,
      perdido("NEW"),
      perdido("IN_PROGRESS", "Sem interesse"),
      perdido("MEETING_SCHEDULED", "Comprou do concorrente"),
      lead({ respondido: true }),
    ]);

    for (let i = 0; i < funil.etapas.length - 1; i += 1) {
      const saida = funil.etapas[i].quantidade - funil.etapas[i + 1].quantidade;
      expect(funil.etapas[i].perdidos + funil.etapas[i].abertos).toBe(saida);
    }
  });

  it("nunca cresce de uma etapa para a seguinte", () => {
    const funil = montaFunil([...cinco, lead({ respondido: true }), perdido("QUALIFIED"), lead({ status: "WON" })]);
    const quantidades = funil.etapas.map((etapa) => etapa.quantidade);
    expect(quantidades).toEqual([...quantidades].sort((a, b) => b - a));
  });

  it("não tira a venda da conta por causa de um dado antigo marcado como perdido", () => {
    const funil = montaFunil([perdido("WON", "Engano")]);
    expect(funil.etapas[4].quantidade).toBe(1);
    expect(funil.perdidos).toBe(0);
    expect(funil.motivosDePerda).toEqual([]);
  });

  it("agrupa os motivos de perda sem diferenciar maiúscula e espaço, o mais comum primeiro", () => {
    const funil = montaFunil([
      perdido("NEW", "Sem interesse"),
      perdido("QUALIFIED", "Preço"),
      perdido("QUALIFIED", " preço "),
      perdido("IN_PROGRESS", "PREÇO"),
      perdido("NEW", null),
      perdido("NEW", "   "),
    ]);

    expect(funil.motivosDePerda).toEqual([
      { motivo: "Preço", quantidade: 3 },
      { motivo: "Sem interesse", quantidade: 1 },
      { motivo: null, quantidade: 2 },
    ]);
  });
});

describe("aplicaFiltros", () => {
  const leads = [
    recortavel({ campanhaId: "111", origem: { key: "meta_ctwa", label: "Anúncio" }, responsavelId: "ana" }),
    recortavel({ campanhaId: "111", origem: { key: "meta_ctwa", label: "Anúncio" }, responsavelId: null }),
    recortavel({ campanhaId: "222", origem: { key: "link:bio", label: "Bio" }, responsavelId: "bruno" }),
    recortavel({ campanhaId: null, origem: { key: "unknown", label: "Sem origem" }, responsavelId: "ana" }),
  ];

  it("sem recorte, devolve todos", () => {
    expect(aplicaFiltros(leads, SEM_FILTRO)).toHaveLength(4);
  });

  it("recorta por campanha, e por falta dela", () => {
    expect(aplicaFiltros(leads, { ...SEM_FILTRO, campanha: "111" })).toHaveLength(2);
    expect(aplicaFiltros(leads, { ...SEM_FILTRO, campanha: "nenhuma" })).toEqual([leads[3]]);
  });

  it("recorta por origem", () => {
    expect(aplicaFiltros(leads, { ...SEM_FILTRO, origem: "link:bio" })).toEqual([leads[2]]);
  });

  it("recorta por responsável, e por falta dele", () => {
    expect(aplicaFiltros(leads, { ...SEM_FILTRO, responsavel: "ana" })).toEqual([leads[0], leads[3]]);
    expect(aplicaFiltros(leads, { ...SEM_FILTRO, responsavel: "nenhum" })).toEqual([leads[1]]);
  });

  it("soma os recortes", () => {
    expect(aplicaFiltros(leads, { campanha: "111", origem: "meta_ctwa", responsavel: "ana" })).toEqual([leads[0]]);
    expect(aplicaFiltros(leads, { campanha: "222", origem: "meta_ctwa", responsavel: null })).toEqual([]);
  });
});

describe("opcoesDosFiltros", () => {
  it("lista as campanhas do período pelo nome, com quantos leads cada uma trouxe", () => {
    const { campanhas } = opcoesDosFiltros(
      [
        recortavel({ campanhaId: "111" }),
        recortavel({ campanhaId: "222" }),
        recortavel({ campanhaId: "222" }),
        recortavel({ campanhaId: "333" }),
      ],
      new Map([
        ["111", "Black Friday"],
        ["222", "Remarketing"],
      ]),
    );

    expect(campanhas).toEqual([
      { valor: "222", rotulo: "Remarketing", leads: 2 },
      { valor: "111", rotulo: "Black Friday", leads: 1 },
      // Ainda não sincronizada: o id cru é verdadeiro e dá para procurar na Meta.
      { valor: "333", rotulo: "Campanha 333", leads: 1 },
    ]);
  });

  it("põe os leads sem campanha e sem origem por último, mesmo quando são a maioria", () => {
    const { campanhas, origens } = opcoesDosFiltros(
      [
        recortavel(),
        recortavel(),
        recortavel(),
        recortavel({ campanhaId: "111", origem: { key: "meta_ctwa", label: "Anúncio Meta" } }),
      ],
      new Map(),
    );

    expect(campanhas.map((opcao) => opcao.valor)).toEqual(["111", "nenhuma"]);
    expect(campanhas[1]).toEqual({ valor: "nenhuma", rotulo: "Sem campanha identificada", leads: 3 });
    expect(origens.map((opcao) => opcao.valor)).toEqual(["meta_ctwa", "unknown"]);
  });

  /*
    Um link salvo com a campanha de março, aberto em julho: sem a opção, a
    lista mostraria "todas" enquanto o funil continua recortado.
  */
  it("mantém na lista o recorte escolhido, mesmo sem lead no período", () => {
    const { campanhas, origens } = opcoesDosFiltros([recortavel({ campanhaId: "111" })], new Map([["999", "Março"]]), {
      campanha: "999",
      origem: "link:bio do instagram",
    });

    expect(campanhas).toContainEqual({ valor: "999", rotulo: "Março", leads: 0 });
    expect(origens).toContainEqual({ valor: "link:bio do instagram", rotulo: "bio do instagram", leads: 0 });
  });

  it("diferencia campanhas com o mesmo nome pelo final do id", () => {
    const { campanhas } = opcoesDosFiltros(
      [recortavel({ campanhaId: "120001111" }), recortavel({ campanhaId: "120002222" })],
      new Map([
        ["120001111", "Leads julho"],
        ["120002222", "Leads julho"],
      ]),
    );

    expect(campanhas.map((opcao) => opcao.rotulo)).toEqual([
      "Leads julho (id final 1111)",
      "Leads julho (id final 2222)",
    ]);
  });
});
