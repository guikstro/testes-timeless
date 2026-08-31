import { computeLeadMetrics, MetricsMessage } from "./lead-metrics";

describe("computeLeadMetrics", () => {
  const base = new Date("2026-01-10T10:00:00.000Z");
  const at = (seconds: number) => new Date(base.getTime() + seconds * 1000);

  function inbound(seconds: number): MetricsMessage {
    return { direction: "INBOUND", timestamp: at(seconds), outboundStatus: null };
  }

  function outbound(seconds: number, outboundStatus: MetricsMessage["outboundStatus"]): MetricsMessage {
    return { direction: "OUTBOUND", timestamp: at(seconds), outboundStatus };
  }

  const lead = { firstContactAt: base, qualifiedAt: null, wonAt: null };

  describe("tempo até a primeira resposta", () => {
    it("mede do primeiro contato do lead até a resposta que saiu", () => {
      const metrics = computeLeadMetrics(lead, [inbound(0), outbound(120, "SENT")], null);

      expect(metrics.firstResponseSeconds).toBe(120);
    });

    /**
     * O caso que mais importa: uma resposta que falhou não chegou ao lead.
     * Contá-la esconderia justamente o atendimento que não aconteceu.
     */
    it("ignora uma resposta que falhou no envio", () => {
      const metrics = computeLeadMetrics(
        lead,
        [inbound(0), outbound(60, "FAILED"), outbound(300, "SENT")],
        null,
      );

      expect(metrics.firstResponseSeconds).toBe(300);
    });

    it("ignora uma resposta ainda pendente", () => {
      const metrics = computeLeadMetrics(lead, [inbound(0), outbound(60, "PENDING")], null);

      expect(metrics.firstResponseSeconds).toBeNull();
    });

    /**
     * Sem status é uma mensagem ingerida do webhook — a equipe respondeu pelo
     * celular. É resposta de verdade, e não contá-la puniria quem atende pelo
     * WhatsApp comum em vez da plataforma.
     */
    it("conta uma resposta enviada pelo celular, fora da plataforma", () => {
      const metrics = computeLeadMetrics(lead, [inbound(0), outbound(45, null)], null);

      expect(metrics.firstResponseSeconds).toBe(45);
    });

    it("ignora uma mensagem nossa anterior ao primeiro contato do lead", () => {
      // Uma campanha ativa pode ter falado com o número antes de ele responder;
      // isso não é resposta a nada.
      const metrics = computeLeadMetrics(lead, [outbound(0, "SENT"), inbound(60), outbound(90, "SENT")], null);

      expect(metrics.firstResponseSeconds).toBe(30);
    });

    it("devolve null quando ninguém respondeu ainda", () => {
      expect(computeLeadMetrics(lead, [inbound(0)], null).firstResponseSeconds).toBeNull();
    });

    /** Zero é um valor legítimo, e precisa ser distinguível de "não sei". */
    it("distingue resposta imediata de ausência de resposta", () => {
      const metrics = computeLeadMetrics(lead, [inbound(0), outbound(0, "SENT")], null);

      expect(metrics.firstResponseSeconds).toBe(0);
      expect(metrics.firstResponseSeconds).not.toBeNull();
    });

    /**
     * O timestamp vem do relógio do WhatsApp, não do nosso: um desencontro
     * entre as duas fontes pode inverter a ordem aparente de eventos próximos.
     */
    it("não informa um tempo negativo quando os relógios divergem", () => {
      const metrics = computeLeadMetrics(lead, [inbound(100), outbound(90, "SENT")], null);

      expect(metrics.firstResponseSeconds).toBeNull();
    });
  });

  describe("clique até o contato", () => {
    it("mede do clique no anúncio até a primeira mensagem do lead", () => {
      const metrics = computeLeadMetrics(lead, [inbound(600)], base);

      expect(metrics.clickToContactSeconds).toBe(600);
    });

    it("devolve null sem clique rastreado", () => {
      expect(computeLeadMetrics(lead, [inbound(600)], null).clickToContactSeconds).toBeNull();
    });
  });

  describe("ciclo até qualificar e vender", () => {
    it("mede a partir do primeiro contato", () => {
      const metrics = computeLeadMetrics(
        { firstContactAt: base, qualifiedAt: at(3600), wonAt: at(86400) },
        [inbound(0)],
        null,
      );

      expect(metrics.timeToQualifiedSeconds).toBe(3600);
      expect(metrics.timeToWonSeconds).toBe(86400);
    });

    it("devolve null enquanto não aconteceram", () => {
      const metrics = computeLeadMetrics(lead, [inbound(0)], null);

      expect(metrics.timeToQualifiedSeconds).toBeNull();
      expect(metrics.timeToWonSeconds).toBeNull();
    });
  });

  describe("quem está devendo resposta", () => {
    it("marca aguardando quando a última mensagem é do lead", () => {
      const metrics = computeLeadMetrics(lead, [outbound(0, "SENT"), inbound(60)], null);

      expect(metrics.awaitingReply).toBe(true);
      expect(metrics.lastMessageDirection).toBe("INBOUND");
    });

    it("não marca aguardando quando a equipe falou por último", () => {
      const metrics = computeLeadMetrics(lead, [inbound(0), outbound(60, "SENT")], null);

      expect(metrics.awaitingReply).toBe(false);
    });

    it("não marca aguardando numa conversa vazia", () => {
      const metrics = computeLeadMetrics(lead, [], null);

      expect(metrics.awaitingReply).toBe(false);
      expect(metrics.lastMessageAt).toBeNull();
    });
  });

  it("conta mensagens por direção", () => {
    const metrics = computeLeadMetrics(
      lead,
      [inbound(0), inbound(10), outbound(20, "SENT"), outbound(30, "FAILED")],
      null,
    );

    // A que falhou continua contando aqui: ela existe na conversa e foi uma
    // tentativa real — o que ela não pode é virar "tempo de resposta".
    expect(metrics.inboundCount).toBe(2);
    expect(metrics.outboundCount).toBe(2);
  });
});
