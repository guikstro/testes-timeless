import { extractAdIds } from "./ad-references";

describe("extractAdIds", () => {
  it("lê as colunas estruturadas de um clique de link rastreável", () => {
    const ids = extractAdIds({
      evidence: null,
      trackingClick: { campaignId: "c-1", adsetId: "s-1", adId: "a-1" },
    });

    expect(ids).toEqual({ campaignId: "c-1", adsetId: "s-1", adId: "a-1" });
  });

  /** No CTWA a Meta entrega o anúncio no referral; não existe clique nosso. */
  it("lê o anúncio da evidência quando não há clique", () => {
    const ids = extractAdIds({ evidence: { adId: "a-9", ctwaClid: "x" }, trackingClick: null });

    expect(ids.adId).toBe("a-9");
    expect(ids.campaignId).toBeNull();
  });

  it("prefere o clique à evidência quando os dois existem", () => {
    const ids = extractAdIds({
      evidence: { adId: "da-evidencia" },
      trackingClick: { campaignId: null, adsetId: null, adId: "do-clique" },
    });

    expect(ids.adId).toBe("do-clique");
  });

  it("cai para a evidência quando a coluna do clique está vazia", () => {
    const ids = extractAdIds({
      evidence: { campaignId: "c-2" },
      trackingClick: { campaignId: null, adsetId: null, adId: null },
    });

    expect(ids.campaignId).toBe("c-2");
  });

  it("trata um lead sem atribuição nenhuma", () => {
    expect(extractAdIds(null)).toEqual({ campaignId: null, adsetId: null, adId: null });
  });

  /** A evidência é JSON livre: nada garante o formato que esperamos. */
  it("ignora uma evidência que não é um objeto", () => {
    expect(extractAdIds({ evidence: "texto solto", trackingClick: null }).adId).toBeNull();
  });

  it("ignora um valor vazio em vez de devolver string vazia", () => {
    expect(extractAdIds({ evidence: { adId: "" }, trackingClick: null }).adId).toBeNull();
  });
});
