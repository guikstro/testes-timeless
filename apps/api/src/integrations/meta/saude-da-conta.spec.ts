import {
  leituraDoStatusDaConta,
  LinhasDaConta,
  montaSaudeDaConta,
  normalizaRespostaDaConta,
} from "./saude-da-conta";

function linhas(over: Partial<LinhasDaConta> = {}): LinhasDaConta {
  return {
    accountName: "Timeless Co.",
    currency: "BRL",
    accountStatus: 1,
    spendCapCents: 1_000_000,
    amountSpentCents: 400_000,
    balanceCents: null,
    healthSyncedAt: new Date("2026-09-22T12:00:00.000Z"),
    ...over,
  };
}

describe("leituraDoStatusDaConta", () => {
  it("traduz os códigos conhecidos", () => {
    expect(leituraDoStatusDaConta(1)).toMatchObject({ rotulo: "Ativa", gravidade: "ok" });
    expect(leituraDoStatusDaConta(2)).toMatchObject({ gravidade: "parada" });
    expect(leituraDoStatusDaConta(9)).toMatchObject({ rotulo: "Em período de carência", gravidade: "atencao" });
  });

  /*
    Um estado que este produto não conhece é exatamente o caso em que não dá
    para afirmar que está tudo bem. O padrão seguro é pedir para olhar.
  */
  it("não chama de ok um código que não conhece", () => {
    const desconhecido = leituraDoStatusDaConta(42)!;
    expect(desconhecido.gravidade).toBe("atencao");
    expect(desconhecido.oQueFazer).toContain("Gerenciador");
  });

  it("distingue nunca lido de estado ruim", () => {
    // Null é "ainda não sei", e a tela precisa poder dizer isso.
    expect(leituraDoStatusDaConta(null)).toBeNull();
  });

  it("diz o que fazer quando há o que fazer", () => {
    expect(leituraDoStatusDaConta(3)!.oQueFazer).toContain("fatura");
    expect(leituraDoStatusDaConta(1)!.oQueFazer).toBeNull();
  });
});

describe("montaSaudeDaConta", () => {
  it("calcula o quanto falta para o teto", () => {
    const saude = montaSaudeDaConta(linhas());

    expect(saude.restanteDoTetoCentavos).toBe(600_000);
    expect(saude.tetoConsumidoPorCento).toBe(40);
    expect(saude.gravidade).toBe("ok");
  });

  describe("a gravidade é a pior notícia, não a média", () => {
    it("acusa o teto quase batido mesmo com a conta ativa", () => {
      const saude = montaSaudeDaConta(linhas({ amountSpentCents: 950_000 }));
      expect(saude.status!.gravidade).toBe("ok");
      expect(saude.gravidade).toBe("atencao");
    });

    it("acusa teto batido como veiculação parada", () => {
      expect(montaSaudeDaConta(linhas({ amountSpentCents: 1_000_000 })).gravidade).toBe("parada");
    });

    it("acusa a conta suspensa mesmo com teto folgado", () => {
      const saude = montaSaudeDaConta(linhas({ accountStatus: 2, amountSpentCents: 1_000 }));
      expect(saude.gravidade).toBe("parada");
    });

    it("acusa saldo pré-pago zerado", () => {
      // Para a veiculação do mesmo jeito que um teto batido.
      expect(montaSaudeDaConta(linhas({ balanceCents: 0 })).gravidade).toBe("parada");
    });
  });

  describe("sem teto definido", () => {
    it("não inventa percentual nem restante", () => {
      const saude = montaSaudeDaConta(linhas({ spendCapCents: null }));

      expect(saude.tetoConsumidoPorCento).toBeNull();
      expect(saude.restanteDoTetoCentavos).toBeNull();
      expect(saude.gravidade).toBe("ok");
    });
  });

  describe("nunca lido", () => {
    it("não afirma que está tudo bem", () => {
      const saude = montaSaudeDaConta({
        accountName: null, currency: null, accountStatus: null,
        spendCapCents: null, amountSpentCents: null, balanceCents: null, healthSyncedAt: null,
      });

      expect(saude.status).toBeNull();
      expect(saude.lidoEm).toBeNull();
      // Sem leitura nenhuma, "ok" seria uma afirmação sem base.
      expect(saude.gravidade).toBe("atencao");
    });
  });
});

describe("normalizaRespostaDaConta", () => {
  /*
    A armadilha central: na Meta, `spend_cap` igual a zero quer dizer SEM
    TETO, não teto esgotado. Tratá-lo como limite inverteria o sentido.
  */
  it("converte teto zero em ausência de teto", () => {
    const linha = normalizaRespostaDaConta({ account_status: 1, spend_cap: "0", amount_spent: "123456" });

    expect(linha.spendCapCents).toBeNull();
    // E a conta com teto zero não é lida como teto esgotado.
    expect(montaSaudeDaConta(linha).gravidade).toBe("ok");
    expect(montaSaudeDaConta(linha).tetoConsumidoPorCento).toBeNull();
  });

  it("lê os valores em texto, que é como a Meta os manda", () => {
    const linha = normalizaRespostaDaConta({
      name: "Timeless Co.",
      currency: "BRL",
      account_status: 1,
      spend_cap: "1000000",
      amount_spent: "250000",
      balance: "75000",
    });

    expect(linha).toMatchObject({
      accountName: "Timeless Co.",
      currency: "BRL",
      accountStatus: 1,
      spendCapCents: 1_000_000,
      amountSpentCents: 250_000,
      balanceCents: 75_000,
    });
  });

  it("trata campo ausente como não lido, e não como zero", () => {
    // Conta pós-paga não tem `balance`. Zero ali diria "sem saldo", que
    // acenderia um alarme falso de veiculação parada.
    const linha = normalizaRespostaDaConta({ account_status: 1 });

    expect(linha.balanceCents).toBeNull();
    expect(linha.spendCapCents).toBeNull();
    expect(linha.amountSpentCents).toBeNull();
  });

  it("ignora texto que não é número", () => {
    expect(normalizaRespostaDaConta({ amount_spent: "n/a" }).amountSpentCents).toBeNull();
  });
});
