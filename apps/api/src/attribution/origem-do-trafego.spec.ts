import { CliqueDeOrigem, origemDaMensagem, viraLead } from "./origem-do-trafego";

function clique(over: Partial<CliqueDeOrigem> = {}): CliqueDeOrigem {
  return { utmMedium: null, gclid: null, fbclid: null, ctwaClid: null, campaignId: null, adId: null, ...over };
}

describe("origemDaMensagem", () => {
  it("é anúncio quando a Meta manda a marca do anúncio na mensagem", () => {
    expect(origemDaMensagem({ anuncioDaMeta: true, clique: null })).toBe("ANUNCIO");
  });

  it("é anúncio quando o link foi clicado num anúncio do Google", () => {
    expect(origemDaMensagem({ anuncioDaMeta: false, clique: clique({ gclid: "abc" }) })).toBe("ANUNCIO");
    expect(origemDaMensagem({ anuncioDaMeta: false, clique: clique({ utmMedium: "CPC" }) })).toBe("ANUNCIO");
  });

  it("é anúncio quando o link carrega o id da campanha da plataforma", () => {
    expect(origemDaMensagem({ anuncioDaMeta: false, clique: clique({ campaignId: "123" }) })).toBe("ANUNCIO");
  });

  it("é link quando o clique veio de lugar sem mídia paga", () => {
    expect(origemDaMensagem({ anuncioDaMeta: false, clique: clique({ utmMedium: "bio" }) })).toBe("LINK");
  });

  it("não tem origem quando a pessoa escreveu direto", () => {
    expect(origemDaMensagem({ anuncioDaMeta: false, clique: null })).toBe("NENHUMA");
  });
});

describe("viraLead", () => {
  it("no tráfego pago, só o anúncio entra", () => {
    expect(viraLead("TRAFEGO_PAGO", "ANUNCIO")).toBe(true);
    expect(viraLead("TRAFEGO_PAGO", "LINK")).toBe(false);
    expect(viraLead("TRAFEGO_PAGO", "NENHUMA")).toBe(false);
  });

  it("no rastreado, entra anúncio e link, e não quem escreveu direto", () => {
    expect(viraLead("RASTREADO", "ANUNCIO")).toBe(true);
    expect(viraLead("RASTREADO", "LINK")).toBe(true);
    expect(viraLead("RASTREADO", "NENHUMA")).toBe(false);
  });

  it("em todos, entra qualquer um", () => {
    expect(viraLead("TODOS", "NENHUMA")).toBe(true);
  });
});
