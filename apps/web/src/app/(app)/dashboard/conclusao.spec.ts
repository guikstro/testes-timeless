import {
  concluiAtendimento,
  concluiFunil,
  concluiOrigem,
  concluiVisaoGeral,
  duracaoCurta,
} from "./conclusao";
import { formatCentsAsBRL } from "@/lib/currency";
import type { Overview, OriginBucket } from "./tipos";

/*
  O real formatado carrega espaço não separável entre "R$" e o número, porque
  é assim que o Intl escreve. Fixar o caractere na expectativa faz o teste
  falhar mostrando duas frases idênticas na tela, que é a pior forma possível
  de perder tempo. A expectativa usa a mesma função que a tela usa.
*/
const reais = formatCentsAsBRL;

function origem(over: Partial<OriginBucket> = {}): OriginBucket {
  return {
    key: "meta_ads",
    label: "Anúncios Meta",
    leads: 10,
    qualified: 4,
    meetings: 2,
    won: 1,
    disqualified: 0,
    revenueCents: 100_000,
    ...over,
  };
}

function overview(over: Partial<Overview> = {}): Overview {
  return {
    period: { days: 30, from: "2026-08-23T00:00:00.000Z", to: "2026-09-22T23:59:59.000Z" },
    totals: {
      leads: 48, disqualified: 8, workable: 40, qualified: 20, meetings: 9, won: 4,
      revenueCents: 3_200_000, qualificationRate: 0.5, closeRate: 0.2,
    },
    comparacao: {
      leads: { delta: 0.12, anterior: 43 },
      qualified: { delta: null, anterior: 0 },
      meetings: { delta: null, anterior: 0 },
      won: { delta: null, anterior: 0 },
      revenueCents: { delta: null, anterior: 0 },
    },
    atendimento: { medianaPrimeiraRespostaSegundos: 840, respondidos: 40, semResposta: 8, aguardando: 6 },
    byOrigin: [origem()],
    daily: [],
    chegadas: [],
    setup: { whatsappConnected: true, metaConnected: true, trackingLinkCount: 3 },
    ...over,
  };
}

describe("concluiVisaoGeral", () => {
  it("diz quanto entrou, se melhorou e quanto voltou", () => {
    expect(concluiVisaoGeral(overview())).toBe(
      `48 leads, 12% acima do período anterior e ${reais(3_200_000)} em vendas atribuídas.`,
    );
  });

  it("chama variação abaixo de um por cento de mesmo ritmo", () => {
    // Meio por cento não é notícia, é arredondamento.
    const o = overview({ comparacao: { ...overview().comparacao, leads: { delta: 0.004, anterior: 47 } } });
    expect(concluiVisaoGeral(o)).toContain("no mesmo ritmo do período anterior");
  });

  it("omite a comparação quando não houve período anterior", () => {
    const o = overview({ comparacao: { ...overview().comparacao, leads: { delta: null, anterior: 0 } } });
    expect(concluiVisaoGeral(o)).toBe(`48 leads e ${reais(3_200_000)} em vendas atribuídas.`);
  });

  it("distingue venda sem valor de ausência de venda", () => {
    // Fechou e ninguém registrou quanto é diferente de não ter fechado.
    const semValor = overview({ totals: { ...overview().totals, revenueCents: 0, won: 3 } });
    const semVenda = overview({ totals: { ...overview().totals, revenueCents: 0, won: 0 } });

    expect(concluiVisaoGeral(semValor)).toContain("sem valor registrado");
    expect(concluiVisaoGeral(semVenda)).not.toContain("vendas");
  });

  it("não afirma queda quando não houve lead nenhum", () => {
    expect(concluiVisaoGeral(overview({ totals: { ...overview().totals, leads: 0 } }))).toBe(
      "Nenhum lead entrou neste período.",
    );
  });
});

describe("concluiFunil", () => {
  /*
    "48 leads, 20 qualificados, 9 reuniões, 4 vendas" é a tabela lida em voz
    alta: quem lê ainda precisa fazer as subtrações. A queda maior é a resposta.
  */
  it("aponta a maior perda, e não repete cada etapa", () => {
    // 48→40 perde 8, 40→20 perde 20, 20→9 perde 11, 9→4 perde 5.
    expect(concluiFunil(overview())).toBe(
      "48 leads viraram 4 clientes. A maior perda é de aproveitável para qualificado: 20.",
    );
  });

  it("diz quando nada fechou", () => {
    const o = overview({ totals: { ...overview().totals, won: 0 } });
    expect(concluiFunil(o)).toContain("nenhuma venda fechada");
  });

  it("não inventa perda quando o funil não perdeu ninguém", () => {
    const o = overview({
      totals: { ...overview().totals, leads: 3, disqualified: 0, workable: 3, qualified: 3, meetings: 3, won: 3 },
    });
    expect(concluiFunil(o)).toBe("3 leads viraram 3 clientes.");
  });
});

describe("concluiOrigem", () => {
  /*
    A pergunta da aba é "o que traz cliente que paga?". Ordenar por volume
    responderia outra coisa, e com frequência responderia errado: a origem mais
    barulhenta costuma ser a que menos fecha.
  */
  it("elege a origem que mais fecha, não a que traz mais lead", () => {
    const o = overview({
      byOrigin: [
        origem({ key: "direct", label: "Direto", leads: 90, won: 1, revenueCents: 50_000 }),
        origem({ key: "meta_ads", label: "Anúncios Meta", leads: 10, won: 5, revenueCents: 900_000 }),
      ],
    });

    expect(concluiOrigem(o)).toBe(`Anúncios Meta é a origem que mais fecha: 5 clientes, ${reais(900_000)}.`);
  });

  it("cai para volume quando nenhuma origem fechou nada, e diz isso", () => {
    const o = overview({
      byOrigin: [
        origem({ key: "direct", label: "Direto", leads: 30, won: 0, revenueCents: 0 }),
        origem({ key: "meta_ads", label: "Anúncios Meta", leads: 5, won: 0, revenueCents: 0 }),
      ],
    });

    expect(concluiOrigem(o)).toBe("Direto trouxe mais leads (30), e nenhuma origem fechou venda ainda.");
  });

  it("não conta o balde de desconhecidos como origem", () => {
    // "Desconhecido" não é uma origem que se possa reforçar.
    const o = overview({ byOrigin: [origem({ key: "unknown", label: "Sem origem", leads: 48, won: 4 })] });
    expect(concluiOrigem(o)).toBe("Nenhum dos 48 leads pôde ser ligado a uma origem.");
  });
});

describe("concluiAtendimento", () => {
  it("dá a mediana em palavras e quantos ainda esperam", () => {
    expect(concluiAtendimento(overview())).toBe(
      "Metade dos leads é respondida em até 14 minutos. 6 ainda esperam resposta.",
    );
  });

  it("sem resposta nenhuma não vira demora, vira ausência de medida", () => {
    const o = overview({
      atendimento: { medianaPrimeiraRespostaSegundos: null, respondidos: 0, semResposta: 48, aguardando: 48 },
    });
    expect(concluiAtendimento(o)).toBe("Nenhum dos 48 leads foi respondido ainda.");
  });

  it("omite a fila quando ninguém está esperando", () => {
    const o = overview({ atendimento: { ...overview().atendimento, aguardando: 0 } });
    expect(concluiAtendimento(o)).toBe("Metade dos leads é respondida em até 14 minutos.");
  });
});

describe("duracaoCurta", () => {
  it("usa a unidade que a pessoa usaria", () => {
    expect(duracaoCurta(45)).toBe("45 segundos");
    expect(duracaoCurta(840)).toBe("14 minutos");
    expect(duracaoCurta(7_200)).toBe("2 horas");
    expect(duracaoCurta(172_800)).toBe("2 dias");
  });

  it("mantém o singular", () => {
    expect(duracaoCurta(60)).toBe("1 minuto");
    expect(duracaoCurta(3_600)).toBe("1 hora");
    expect(duracaoCurta(86_400)).toBe("1 dia");
  });
});
