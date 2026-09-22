import { completaIdsDoAnuncio, HierarquiaDoAnuncio } from "./vinculo-do-anuncio";

const HIERARQUIA = new Map<string, HierarquiaDoAnuncio>([
  ["ad1", { campaignExternalId: "camp1", adSetExternalId: "set1" }],
]);

describe("completaIdsDoAnuncio", () => {
  /*
    O defeito que isto conserta: a Meta manda só o id do anúncio no referral de
    um Click-to-WhatsApp. Sem subir a hierarquia, o lead com a evidência mais
    forte do produto entrava com campanha nula e sumia do desempenho por
    campanha, embora a ficha dele mostrasse o nome da campanha.
  */
  it("completa campanha e conjunto quando só veio o anúncio", () => {
    const completo = completaIdsDoAnuncio({ campaignId: null, adsetId: null, adId: "ad1" }, HIERARQUIA);

    expect(completo).toEqual({ campaignId: "camp1", adsetId: "set1", adId: "ad1" });
  });

  it("preserva o que a evidência já trazia", () => {
    // O clique registra o que aconteceu; a hierarquia é o estado atual da
    // conta. Um anúncio movido de campanha depois não reescreve a origem.
    const completo = completaIdsDoAnuncio(
      { campaignId: "camp-do-clique", adsetId: "set-do-clique", adId: "ad1" },
      HIERARQUIA,
    );

    expect(completo).toEqual({ campaignId: "camp-do-clique", adsetId: "set-do-clique", adId: "ad1" });
  });

  it("não inventa nada para anúncio que a sincronia não conhece", () => {
    const completo = completaIdsDoAnuncio({ campaignId: null, adsetId: null, adId: "apagado" }, HIERARQUIA);

    expect(completo).toEqual({ campaignId: null, adsetId: null, adId: "apagado" });
  });

  it("devolve o lead sem anúncio intacto", () => {
    const sem = { campaignId: null, adsetId: null, adId: null };
    expect(completaIdsDoAnuncio(sem, HIERARQUIA)).toEqual(sem);
  });

  it("completa só o que falta", () => {
    const completo = completaIdsDoAnuncio({ campaignId: "camp-do-clique", adsetId: null, adId: "ad1" }, HIERARQUIA);

    expect(completo).toEqual({ campaignId: "camp-do-clique", adsetId: "set1", adId: "ad1" });
  });
});
