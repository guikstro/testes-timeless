import {
  compara,
  medianaPrimeiraResposta,
  aggregateByOrigin,
  aggregateDaily,
  aggregateTotals,
  AggregationLead,
  classifyOrigin,
} from "./overview-aggregation";

describe("agregação do dashboard", () => {
  function lead(overrides: Partial<AggregationLead> = {}): AggregationLead {
    return {
      status: "NEW",
      firstContactAt: new Date("2026-01-10T12:00:00"),
      meetingScheduledAt: null,
      disqualifiedAt: null,
      attribution: null,
      sale: null,
      ...overrides,
    };
  }

  function fromLink(name: string | null, utmSource: string | null = null): AggregationLead["attribution"] {
    return {
      method: "TRACKING_LINK",
      trackingClick: { utmSource, trackingLink: name ? { name } : null },
    };
  }

  describe("classifyOrigin", () => {
    it("trata um lead sem atribuição como origem desconhecida", () => {
      expect(classifyOrigin(lead())).toMatchObject({ key: "unknown" });
    });

    it("trata UNKNOWN como desconhecida — nunca chuta um canal", () => {
      const attribution = { method: "UNKNOWN" as const, trackingClick: null };
      expect(classifyOrigin(lead({ attribution }))).toMatchObject({ key: "unknown" });
    });

    it("identifica um anúncio Click-to-WhatsApp", () => {
      const attribution = { method: "CTWA_REFERRAL" as const, trackingClick: null };
      expect(classifyOrigin(lead({ attribution }))).toMatchObject({ key: "meta_ctwa" });
    });

    it("agrupa link rastreável pelo nome que o usuário deu", () => {
      expect(classifyOrigin(lead({ attribution: fromLink("Bio do Instagram") }))).toEqual({
        key: "link:bio do instagram",
        label: "Bio do Instagram",
      });
    });

    it("cai para o utm_source quando o link não tem nome", () => {
      expect(classifyOrigin(lead({ attribution: fromLink(null, "google") }))).toMatchObject({
        label: "google",
      });
    });

    it("não quebra num link sem nome nem utm_source", () => {
      expect(classifyOrigin(lead({ attribution: fromLink(null, null) }))).toMatchObject({
        key: "link:sem-nome",
      });
    });

    /** Nomes iguais com caixa diferente são a mesma origem. */
    it("agrupa nomes que só diferem em maiúsculas", () => {
      const a = classifyOrigin(lead({ attribution: fromLink("Instagram") }));
      const b = classifyOrigin(lead({ attribution: fromLink("instagram") }));
      expect(a.key).toBe(b.key);
    });

    it("ignora espaços em volta do nome", () => {
      expect(classifyOrigin(lead({ attribution: fromLink("  Bio  ") }))).toMatchObject({ label: "Bio" });
    });
  });

  describe("aggregateTotals", () => {
    it("conta o funil e soma a receita", () => {
      const totals = aggregateTotals([
        lead({ status: "NEW" }),
        lead({ status: "QUALIFIED" }),
        lead({ status: "WON", sale: { amountCents: 150000 } }),
        lead({ status: "WON", sale: { amountCents: 50000 } }),
      ]);

      expect(totals).toMatchObject({ leads: 4, qualified: 3, won: 2, revenueCents: 200000 });
    });

    it("calcula fechamento sobre os qualificados, não sobre o total", () => {
      const totals = aggregateTotals([lead({ status: "NEW" }), lead({ status: "QUALIFIED" }), lead({ status: "WON" })]);

      expect(totals.qualificationRate).toBeCloseTo(2 / 3);
      expect(totals.closeRate).toBeCloseTo(1 / 2);
    });

    /** 0% afirmaria que ninguém converteu; sem leads, não houve o que converter. */
    it("devolve null em vez de zero num período sem leads", () => {
      const totals = aggregateTotals([]);

      expect(totals.leads).toBe(0);
      expect(totals.qualificationRate).toBeNull();
      expect(totals.closeRate).toBeNull();
    });

    it("trata venda sem valor confirmado como zero de receita, não como erro", () => {
      const totals = aggregateTotals([lead({ status: "WON", sale: { amountCents: null } })]);

      expect(totals.won).toBe(1);
      expect(totals.revenueCents).toBe(0);
    });

    /**
     * O ponto de existir a desqualificação: um lead descartado nunca foi
     * oportunidade, e mantê-lo no denominador faria a taxa cair como se fosse
     * negócio perdido.
     */
    it("tira os desqualificados do denominador da taxa de qualificação", () => {
      const totals = aggregateTotals([
        lead({ status: "QUALIFIED" }),
        lead({ status: "NEW" }),
        lead({ status: "NEW", disqualifiedAt: new Date() }),
        lead({ status: "NEW", disqualifiedAt: new Date() }),
      ]);

      // 1 qualificado sobre 2 aproveitáveis — não sobre os 4 leads.
      expect(totals.leads).toBe(4);
      expect(totals.disqualified).toBe(2);
      expect(totals.workable).toBe(2);
      expect(totals.qualificationRate).toBeCloseTo(0.5);
    });

    it("devolve null quando todos os leads foram desqualificados", () => {
      const totals = aggregateTotals([lead({ disqualifiedAt: new Date() })]);

      expect(totals.workable).toBe(0);
      expect(totals.qualificationRate).toBeNull();
    });

    /** A data da reunião persiste depois da venda — é ela que conta, não o status. */
    it("conta reuniões pela data, não pelo status atual", () => {
      const totals = aggregateTotals([
        lead({ status: "WON", meetingScheduledAt: new Date() }),
        lead({ status: "MEETING_SCHEDULED", meetingScheduledAt: new Date() }),
        lead({ status: "WON" }),
      ]);

      expect(totals.meetings).toBe(2);
      expect(totals.won).toBe(2);
    });
  });

  describe("aggregateByOrigin", () => {
    it("separa os leads por origem com o funil de cada uma", () => {
      const buckets = aggregateByOrigin([
        lead({ attribution: fromLink("Bio"), status: "WON", sale: { amountCents: 90000 } }),
        lead({ attribution: fromLink("Bio"), status: "QUALIFIED" }),
        lead({ attribution: { method: "CTWA_REFERRAL", trackingClick: null } }),
      ]);

      const bio = buckets.find((bucket) => bucket.label === "Bio");
      expect(bio).toMatchObject({ leads: 2, qualified: 2, won: 1, revenueCents: 90000 });
      expect(buckets.find((bucket) => bucket.key === "meta_ctwa")).toMatchObject({ leads: 1, won: 0 });
    });

    it("ordena da origem com mais leads para a com menos", () => {
      const buckets = aggregateByOrigin([
        lead({ attribution: fromLink("Pouco") }),
        lead({ attribution: fromLink("Muito") }),
        lead({ attribution: fromLink("Muito") }),
      ]);

      expect(buckets.map((bucket) => bucket.label)).toEqual(["Muito", "Pouco"]);
    });

    /** A desconhecida é resíduo, não canal: fica por último mesmo sendo a maior. */
    it("deixa a origem desconhecida por último mesmo quando é a maior", () => {
      const buckets = aggregateByOrigin([lead(), lead(), lead(), lead({ attribution: fromLink("Bio") })]);

      expect(buckets[buckets.length - 1].key).toBe("unknown");
      expect(buckets[0].label).toBe("Bio");
    });

    it("devolve lista vazia sem leads", () => {
      expect(aggregateByOrigin([])).toEqual([]);
    });
  });

  describe("aggregateDaily", () => {
    const from = new Date("2026-01-10T00:00:00");
    const to = new Date("2026-01-12T23:59:59");

    /** Dias vazios precisam existir, senão o gráfico sugere um fluxo constante que não houve. */
    it("inclui dias sem lead nenhum, com zero", () => {
      const daily = aggregateDaily([lead({ firstContactAt: new Date("2026-01-10T09:00:00") })], from, to);

      expect(daily).toHaveLength(3);
      expect(daily[0]).toMatchObject({ date: "2026-01-10", leads: 1 });
      expect(daily[1]).toMatchObject({ date: "2026-01-11", leads: 0, won: 0 });
    });

    it("conta vendas junto dos leads do dia", () => {
      const daily = aggregateDaily(
        [
          lead({ firstContactAt: new Date("2026-01-11T10:00:00"), status: "WON" }),
          lead({ firstContactAt: new Date("2026-01-11T11:00:00"), status: "NEW" }),
        ],
        from,
        to,
      );

      expect(daily[1]).toMatchObject({ date: "2026-01-11", leads: 2, won: 1 });
    });

    /** Um lead das 21h em Brasília é de hoje; em UTC viraria amanhã. */
    it("usa a data local, não UTC", () => {
      const daily = aggregateDaily([lead({ firstContactAt: new Date("2026-01-10T21:00:00") })], from, to);

      expect(daily[0]).toMatchObject({ date: "2026-01-10", leads: 1 });
    });

    it("ignora um lead fora da janela em vez de criar um ponto novo", () => {
      const daily = aggregateDaily([lead({ firstContactAt: new Date("2025-12-01T10:00:00") })], from, to);

      expect(daily).toHaveLength(3);
      expect(daily.every((point) => point.leads === 0)).toBe(true);
    });
  });

  describe("comparação com o período anterior", () => {
    it("calcula a variação como fração", () => {
      expect(compara(115, 100).delta).toBeCloseTo(0.15);
      expect(compara(80, 100).delta).toBeCloseTo(-0.2);
    });

    /**
     * Sair de zero para dez não é crescimento infinito, é começar. Um
     * percentual ali inventaria uma proporção que não existe.
     */
    it("devolve null quando o período anterior foi zero", () => {
      expect(compara(10, 0).delta).toBeNull();
      expect(compara(10, 0).anterior).toBe(0);
    });

    it("trata dois períodos vazios sem quebrar", () => {
      expect(compara(0, 0).delta).toBeNull();
    });
  });

  describe("mediana do tempo de resposta", () => {
    /** Um lead respondido três dias depois puxaria a média e mentiria sobre o típico. */
    it("resiste a um valor extremo, ao contrário da média", () => {
      const tempos = [60, 90, 120, 150, 259200];
      expect(medianaPrimeiraResposta(tempos)).toBe(120);
    });

    it("faz a média dos dois centrais numa quantidade par", () => {
      expect(medianaPrimeiraResposta([100, 200, 300, 400])).toBe(250);
    });

    it("ignora quem ainda não foi respondido", () => {
      expect(medianaPrimeiraResposta([null, 100, null, 300])).toBe(200);
    });

    it("devolve null quando ninguém foi respondido", () => {
      expect(medianaPrimeiraResposta([null, null])).toBeNull();
    });
  });
});
