import { identificacaoDosLeads, LeadIdentificado } from "./identificacao-dos-leads";

function lead(over: Partial<LeadIdentificado> = {}): LeadIdentificado {
  return { metodo: "CTWA_REFERRAL", adExternalId: "ad1", anuncioConhecido: true, ...over };
}

describe("identificacaoDosLeads", () => {
  it("separa os quatro destinos possíveis de um lead", () => {
    const resultado = identificacaoDosLeads([
      lead(),
      lead({ adExternalId: "apagado", anuncioConhecido: false }),
      lead({ metodo: "TRACKING_LINK", adExternalId: null }),
      lead({ metodo: "UNKNOWN", adExternalId: null, anuncioConhecido: false }),
    ]);

    expect(resultado).toMatchObject({
      total: 4,
      atePeloAnuncio: 1,
      deAnuncioDesconhecido: 1,
      semNivelDeAnuncio: 1,
      semOrigem: 1,
    });
  });

  it("conta os métodos separados, porque eles provam coisas diferentes", () => {
    // CTWA é a Meta dizendo de onde veio. Link é o nosso token casado de volta
    // com o clique. Somar os dois num "atribuído" apagaria essa diferença.
    const resultado = identificacaoDosLeads([
      lead(),
      lead(),
      lead({ metodo: "TRACKING_LINK" }),
      lead({ metodo: "UNKNOWN", adExternalId: null }),
    ]);

    expect(resultado.porMetodo).toEqual({ CTWA_REFERRAL: 2, TRACKING_LINK: 1, UNKNOWN: 1 });
  });

  it("trata lead sem linha de atribuição igual a lead sem origem", () => {
    const resultado = identificacaoDosLeads([lead({ metodo: null, adExternalId: null })]);

    expect(resultado.semOrigem).toBe(1);
    expect(resultado.porMetodo.UNKNOWN).toBe(1);
  });

  it("mede a cobertura pelo que a tabela por anúncio consegue mostrar", () => {
    // É esse o número honesto: não "quantos têm origem", e sim quantos
    // aparecem numa linha da tabela que o cliente está lendo.
    const resultado = identificacaoDosLeads([lead(), lead(), lead({ metodo: "UNKNOWN", adExternalId: null }), lead({ adExternalId: null })]);

    expect(resultado.coberturaPorCento).toBe(50);
  });

  it("não inventa percentual sobre nenhum lead", () => {
    // Zero por cento diria que a identificação falhou; o caso é que não houve
    // lead nenhum para identificar.
    expect(identificacaoDosLeads([]).coberturaPorCento).toBeNull();
    expect(identificacaoDosLeads([]).total).toBe(0);
  });

  it("arredonda a cobertura em uma casa", () => {
    const leads = [lead(), ...Array.from({ length: 2 }, () => lead({ metodo: "UNKNOWN" as const, adExternalId: null }))];
    expect(identificacaoDosLeads(leads).coberturaPorCento).toBe(33.3);
  });
});
