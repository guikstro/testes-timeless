import { BadRequestException } from "@nestjs/common";
import { PAINEL_PADRAO, validaBlocos } from "./painel.service";
import { digitosDeTelefone, montaContexto, termosDeNome } from "./busca.service";

describe("validaBlocos", () => {
  it("aceita o painel padrão como está", () => {
    expect(validaBlocos(PAINEL_PADRAO)).toEqual(PAINEL_PADRAO);
  });

  it("recusa tipo desconhecido, id repetido e lista grande", () => {
    expect(() => validaBlocos([{ id: "a", tipo: "hack", largura: 1 }])).toThrow(BadRequestException);
    expect(() => validaBlocos([{ id: "a", tipo: "links", largura: 1 }, { id: "a", tipo: "links", largura: 1 }])).toThrow(BadRequestException);
    expect(() => validaBlocos(Array.from({ length: 25 }, (_, i) => ({ id: `b${i}`, tipo: "links", largura: 1 })))).toThrow(BadRequestException);
    expect(() => validaBlocos("x")).toThrow(BadRequestException);
  });

  it("normaliza largura e só guarda link de teste A/B que pareça uuid", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const [ab, outro] = validaBlocos([
      { id: "ab", tipo: "teste-ab", largura: 7, linkA: uuid, linkB: "'; drop table" },
      { id: "n", tipo: "numero-leads", largura: 3, linkA: uuid },
    ]);
    expect(ab).toEqual({ id: "ab", tipo: "teste-ab", largura: 1, linkA: uuid });
    expect(outro).toEqual({ id: "n", tipo: "numero-leads", largura: 3 });
  });
});

describe("busca", () => {
  it("reconhece pedaço de telefone", () => {
    expect(digitosDeTelefone("lead 85 9968-3707")).toBe("8599683707");
    expect(digitosDeTelefone("quantos leads em 30 dias")).toBeNull();
  });

  it("tira palavras de pergunta antes de buscar nome", () => {
    expect(termosDeNome("Quantos leads da Maria essa semana?")).toEqual(["maria"]);
    expect(termosDeNome("quem falou em rescisão")).toEqual(["falou", "rescisão"]);
  });

  it("monta o contexto só com o que foi recuperado", () => {
    const ctx = montaContexto(
      { leads7: 2, leads30: 9, qualificados30: 3, clientes30: 1, porLink: [{ nome: "LP Rescisão", campanha: "REC", cliques: 40, leads: 5 }] },
      [{ tipo: "mensagem", titulo: "Ana", trecho: "fui «demitida»", quando: "2026-11-23" }],
    );
    expect(ctx).toContain("últimos 7 dias: 2");
    expect(ctx).toContain("LP Rescisão (campanha REC): 40 cliques, 5 leads");
    expect(ctx).toContain("[mensagem] Ana em 2026-11-23: fui «demitida»");
  });
});
