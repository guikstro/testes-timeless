import { anonimiza, montaTranscricao } from "./transcricao";

describe("anonimiza", () => {
  it("troca telefone, CPF, CNPJ e e-mail, em qualquer formato", () => {
    const saida = anonimiza(
      "Me chama em (85) 99668-7075 ou +55 85 99668 7075 ou 85996687075. CPF 123.456.789-09, CNPJ 12.345.678/0001-95, maria.silva@gmail.com",
    );
    expect(saida).not.toMatch(/\d{4,}/);
    expect(saida).not.toContain("@");
    expect(saida.match(/\[número\]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(saida).toContain("[e-mail]");
  });

  it("não confunde valor em reais com telefone", () => {
    const texto = "Fechado por R$ 2.500.000,00, entrada de R$ 1.500 e parcelas de 350";
    expect(anonimiza(texto)).toBe(texto);
  });

  it("não mexe em data, hora e quantidades", () => {
    const texto = "Dia 08/10/2026 às 14:30, são 12 parcelas de 99,90";
    expect(anonimiza(texto)).toBe(texto);
  });

  it("troca o CNPJ inteiro, com barra, sem deixar pedaço", () => {
    expect(anonimiza("CNPJ 12.345.678/0001-95 ok")).toBe("CNPJ [número] ok");
  });

  it("troca o nome do lead por palavra inteira, sem acento nem caixa", () => {
    expect(anonimiza("Oi, aqui é a MARIA da Silva. Obrigada, maria!", ["Maria da Silva"])).toBe(
      "Oi, aqui é a [cliente] da [cliente]. Obrigada, [cliente]!",
    );
  });

  it("não troca pedaço de outra palavra", () => {
    expect(anonimiza("Marianela e Mariana", ["Maria"])).toBe("Marianela e Mariana");
  });

  it("ignora partículas e nomes curtos demais", () => {
    expect(anonimiza("Ana de Jesus foi com o Zé", ["Ana de Jesus", "Zé"])).toBe("[cliente] de [cliente] foi com o Zé");
  });
});

describe("montaTranscricao", () => {
  const msg = (direction: "INBOUND" | "OUTBOUND", text: string | null, iso: string) => ({ direction, text, timestamp: new Date(iso) });

  it("separa quem falou, marca o dia e ordena por horário", () => {
    const t = montaTranscricao([
      msg("OUTBOUND", "Pode ser sexta?", "2026-10-02T13:05:00Z"),
      msg("INBOUND", "Quero fechar", "2026-10-01T13:00:00Z"),
      msg("INBOUND", "Fechado!", "2026-10-02T13:10:00Z"),
    ]);
    expect(t.texto.split("\n")).toEqual([
      "--- 01/10 ---",
      "[10:00] Cliente: Quero fechar",
      "--- 02/10 ---",
      "[10:05] Equipe: Pode ser sexta?",
      "[10:10] Cliente: Fechado!",
    ]);
    expect(t.mensagens).toBe(3);
  });

  it("marca áudio e imagem como mídia e conta quantas foram", () => {
    const t = montaTranscricao([msg("INBOUND", null, "2026-10-01T13:00:00Z"), msg("INBOUND", "  ", "2026-10-01T13:01:00Z")]);
    expect(t.texto).toContain("[mídia ou áudio]");
    expect(t.midias).toBe(2);
  });

  it("anonimiza o texto e junta quebras de linha numa só", () => {
    const t = montaTranscricao([msg("INBOUND", "Sou o João\nmeu zap 85 99999 1234", "2026-10-01T13:00:00Z")], { nomes: ["João"] });
    expect(t.texto).toContain("Sou o [cliente] meu zap [número]");
  });

  it("conversa enorme fica com o fim, e avisa quanto cortou", () => {
    const muitas = Array.from({ length: 10 }, (_, i) => msg("INBOUND", `m${i}`, `2026-10-01T13:${String(i).padStart(2, "0")}:00Z`));
    const t = montaTranscricao(muitas, { max: 4 });
    expect(t.omitidas).toBe(6);
    expect(t.mensagens).toBe(4);
    expect(t.texto).toContain("6 mensagens do começo");
    expect(t.texto).toContain("m9");
    expect(t.texto).not.toContain("m5");
  });
});
