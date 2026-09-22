import { SituacaoDaVerba } from "../../budgets/calculo-da-verba";
import {
  confereOrcamentoDiario,
  planejaMudancaDeStatus,
  podeEscreverNaConta,
} from "./controle-de-anuncios";

function verba(over: Partial<SituacaoDaVerba> = {}): SituacaoDaVerba {
  return {
    amountCents: 500_000,
    de: "2026-09-01",
    ate: "2026-09-30",
    gastoCentavos: 200_000,
    saldoCentavos: 300_000,
    consumidoPorCento: 40,
    diasCorridos: 21,
    diasRestantes: 9,
    ritmoDiarioCentavos: 9_523,
    acabaEm: "2026-10-22",
    ritmoIdealCentavos: 33_333,
    ...over,
  };
}

describe("podeEscreverNaConta", () => {
  it("deixa quem responde pela conta escrever", () => {
    expect(podeEscreverNaConta("OWNER")).toBe(true);
    expect(podeEscreverNaConta("ADMIN")).toBe(true);
  });

  it("não deixa quem só atende", () => {
    // Um erro de leitura gera relatório errado. Um erro aqui gera cobrança
    // errada, e é por isso que os dois não têm a mesma porta.
    expect(podeEscreverNaConta("MEMBER")).toBe(false);
  });
});

describe("planejaMudancaDeStatus", () => {
  it("escreve quando o estado é outro", () => {
    expect(planejaMudancaDeStatus("ACTIVE", "PAUSED")).toMatchObject({ precisaEscrever: true, de: "ACTIVE" });
  });

  it("não escreve quando já está no estado pedido", () => {
    // Clique duplo, ou dois operadores agindo juntos. Não é erro, e também não
    // merece uma linha no histórico dizendo que alguém mudou o que não mudou.
    expect(planejaMudancaDeStatus("PAUSED", "PAUSED").precisaEscrever).toBe(false);
  });

  it("compara sem se importar com caixa", () => {
    expect(planejaMudancaDeStatus("paused", "PAUSED").precisaEscrever).toBe(false);
  });

  it("trata estado desconhecido como precisando escrever", () => {
    // ARCHIVED, DELETED, ou o que a Meta inventar: na dúvida, aplicar o pedido
    // é mais seguro que decidir sozinho que já está certo.
    expect(planejaMudancaDeStatus("ARCHIVED", "ACTIVE").precisaEscrever).toBe(true);
  });
});

describe("confereOrcamentoDiario", () => {
  /*
    A razão de esta função existir: a Meta não sabe quanto foi combinado com o
    cliente, então ela aceita qualquer diário sem piscar.
  */
  it("recusa o diário que consome a verba antes do fim do período", () => {
    // R$ 300,00 por dia, faltando 10 dias, com R$ 3.000,00 de saldo: dá exato.
    // R$ 500,00 por dia estoura.
    const veredicto = confereOrcamentoDiario(50_000, verba(), false);

    expect(veredicto.permitido).toBe(false);
    expect(veredicto).toHaveProperty("motivo", expect.stringContaining("6 dias"));
  });

  it("diz qual é o teto que caberia", () => {
    const veredicto = confereOrcamentoDiario(50_000, verba(), false);

    // Saldo 3.000 dividido por 10 dias restantes contando hoje.
    expect(veredicto).toHaveProperty("motivo", expect.stringContaining("R$ 300,00"));
  });

  it("aceita o diário que cabe até o fim", () => {
    expect(confereOrcamentoDiario(30_000, verba(), false)).toEqual({ permitido: true, aviso: null });
  });

  it("aceita exatamente o que fecha a verba no último dia", () => {
    // O limite é para ser alcançável: recusar o valor exato mandaria a pessoa
    // adivinhar um centavo a menos.
    expect(confereOrcamentoDiario(30_000, verba(), false).permitido).toBe(true);
  });

  it("deixa passar quando o estouro é confirmado, e registra que foi deliberado", () => {
    const veredicto = confereOrcamentoDiario(50_000, verba(), true);

    expect(veredicto.permitido).toBe(true);
    expect(veredicto).toHaveProperty("aviso", expect.stringContaining("Estouro confirmado"));
  });

  describe("sem fim declarado", () => {
    it("não impede, porque não há prazo para estourar", () => {
      // Verba sem fim é depósito de crédito: vale até acabar.
      const veredicto = confereOrcamentoDiario(50_000, verba({ diasRestantes: null, ate: null }), false);

      expect(veredicto.permitido).toBe(true);
      expect(veredicto).toHaveProperty("aviso", expect.stringContaining("6 dias"));
    });
  });

  describe("sem verba declarada", () => {
    it("não inventa teto nenhum", () => {
      // Um teto inventado seria pior que nenhum: pareceria uma regra da casa.
      expect(confereOrcamentoDiario(500_000, null, false)).toEqual({ permitido: true, aviso: null });
    });
  });

  describe("verba já esgotada", () => {
    it("recusa qualquer diário", () => {
      const veredicto = confereOrcamentoDiario(1_000, verba({ saldoCentavos: -5_000 }), false);
      expect(veredicto.permitido).toBe(false);
    });

    it("mas aceita com confirmação, porque a decisão é do cliente", () => {
      expect(confereOrcamentoDiario(1_000, verba({ saldoCentavos: 0 }), true).permitido).toBe(true);
    });
  });

  describe("valores que a Meta recusaria", () => {
    it("recusa abaixo do mínimo antes de gastar uma chamada", () => {
      expect(confereOrcamentoDiario(100, verba(), false)).toHaveProperty("permitido", false);
    });

    it("recusa centavo quebrado e negativo", () => {
      expect(confereOrcamentoDiario(1_000.5, verba(), false).permitido).toBe(false);
      expect(confereOrcamentoDiario(-1_000, verba(), false).permitido).toBe(false);
    });

    it("o mínimo vale mesmo com estouro confirmado", () => {
      // Confirmar o estouro da verba não faz a Meta aceitar um diário inválido.
      expect(confereOrcamentoDiario(100, verba(), true).permitido).toBe(false);
    });
  });
});
