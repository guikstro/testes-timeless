import { validaCitacoes } from "./citacoes";

const conversa = `[10:00] Cliente: Pode fechar! Mando o PIX agora.
[10:05] Equipe: Pagamento recebido, obrigada.`;

describe("validaCitacoes", () => {
  it("aceita trecho que existe, sem ligar para acento, caixa e pontuação", () => {
    expect(validaCitacoes(["pode fechar", "PIX agora", "pagamento recebido obrigada"], conversa).invalidas).toEqual([]);
  });

  it("recusa trecho que ninguém escreveu", () => {
    const r = validaCitacoes(["Pode fechar", "Fechamos por R$ 850"], conversa);
    expect(r.validas).toEqual(["Pode fechar"]);
    expect(r.invalidas).toEqual(["Fechamos por R$ 850"]);
  });

  it("reticências valem como dois trechos, e cada um precisa existir", () => {
    expect(validaCitacoes(["Pode fechar ... Mando o PIX"], conversa).invalidas).toEqual([]);
    expect(validaCitacoes(["Pode fechar ... compro tudo"], conversa).invalidas).toEqual(["Pode fechar ... compro tudo"]);
  });

  it("recusa citação vazia ou curta demais para provar algo", () => {
    expect(validaCitacoes(["", "  ", "ok"], conversa).validas).toEqual([]);
  });
});
