import { trabalhoDaCampanha } from "./trabalho";

describe("o trabalho de cada campanha", () => {
  const de = (objetivo: string | null, plataforma = "META", extra: { comLoja?: boolean; acoesLocais?: number } = {}) =>
    trabalhoDaCampanha({ objetivo, plataforma, comLoja: extra.comLoja ?? false, acoesLocais: extra.acoesLocais });

  it("vídeo e alcance existem para serem vistos, não para trazer lead", () => {
    expect(de("OUTCOME_AWARENESS")).toBe("visto");
    expect(de("VIDEO_VIEWS")).toBe("visto");
    expect(de("GOOGLE_VIDEO", "GOOGLE")).toBe("visto");
  });

  it("engajamento, tráfego e mensagens levam ao WhatsApp; cadastro, vendas e pesquisa trazem cliente", () => {
    expect(de("OUTCOME_ENGAGEMENT")).toBe("whatsapp");
    expect(de("OUTCOME_TRAFFIC")).toBe("whatsapp");
    expect(de("OUTCOME_LEADS")).toBe("cliente");
    expect(de("GOOGLE_SEARCH", "GOOGLE")).toBe("cliente");
  });

  it("sem objetivo informado: Google é pesquisa, Meta é conversa", () => {
    expect(de(null, "GOOGLE")).toBe("cliente");
    expect(de(null, "META")).toBe("whatsapp");
  });

  it("trazer à loja só existe para quem mede presença local", () => {
    expect(de("GOOGLE_LOCAL", "GOOGLE")).toBe("cliente");
    expect(de("GOOGLE_LOCAL", "GOOGLE", { comLoja: true })).toBe("loja");
    expect(de("GOOGLE_SEARCH", "GOOGLE", { comLoja: true, acoesLocais: 4 })).toBe("loja");
    expect(de("GOOGLE_VIDEO", "GOOGLE", { comLoja: true, acoesLocais: 4 })).toBe("visto");
  });
});
