import { ATRASO_SEGUNDOS, montaItem } from "./conversation-list";
import type { LinhaDaCaixa } from "./caixa-de-entrada";

const AGORA = new Date("2026-03-01T12:00:00.000Z");

function linha(over: Partial<LinhaDaCaixa> = {}): LinhaDaCaixa {
  return {
    id: "conv-1",
    lastMessageAt: new Date("2026-03-01T11:50:00.000Z"),
    leadId: "lead-1",
    leadName: "Ana",
    normalizedPhone: "5585999999999",
    rawPhone: "5585999999999",
    status: "NEW",
    disqualifiedAt: null,
    naoRespondidas: 0,
    esperaDesde: null,
    ultimaDirecao: "OUTBOUND",
    ultimoTipo: "TEXT",
    ultimoTexto: "Bom dia",
    ultimaEm: new Date("2026-03-01T11:50:00.000Z"),
    ...over,
  };
}

describe("montaItem", () => {
  it("descreve a conversa com prévia, contagem e espera", () => {
    const item = montaItem(
      linha({
        naoRespondidas: 2,
        esperaDesde: new Date("2026-03-01T11:00:00.000Z"),
        ultimaDirecao: "INBOUND",
        ultimoTexto: "Ainda está aí?",
      }),
      AGORA,
    );

    expect(item.lastMessage).toMatchObject({ direction: "INBOUND", text: "Ainda está aí?" });
    expect(item.unreadCount).toBe(2);
    expect(item.awaitingReply).toBe(true);
    // Conta desde a primeira sem resposta, não desde a última: se o lead
    // mandou três mensagens em uma hora, ele espera há uma hora.
    expect(item.esperandoHaSegundos).toBe(3600);
  });

  it("normaliza a prévia para não quebrar a linha da lista", () => {
    const item = montaItem(linha({ ultimoTexto: "  oi\n\n  tudo   bem?  " }), AGORA);

    expect(item.lastMessage?.text).toBe("oi tudo bem?");
  });

  it("descreve mensagem sem texto em vez de deixar a linha vazia", () => {
    const item = montaItem(linha({ ultimoTipo: "OTHER", ultimoTexto: null }), AGORA);

    expect(item.lastMessage?.text).toBe("Mensagem não textual");
  });

  it("aceita conversa ainda sem nenhuma mensagem", () => {
    const item = montaItem(
      linha({ ultimaDirecao: null, ultimoTipo: null, ultimoTexto: null, ultimaEm: null }),
      AGORA,
    );

    expect(item.lastMessage).toBeNull();
    expect(item.awaitingReply).toBe(false);
    expect(item.esperandoHaSegundos).toBeNull();
  });

  it("não inventa espera quando ninguém está esperando", () => {
    const item = montaItem(linha({ naoRespondidas: 0, esperaDesde: null }), AGORA);

    expect(item.awaitingReply).toBe(false);
    expect(item.esperandoHaSegundos).toBeNull();
  });

  it("nunca devolve espera negativa", () => {
    // O horário vem do relógio do WhatsApp, não do nosso: mensagem com
    // carimbo no futuro existe, e "esperando há menos vinte segundos" seria
    // pior que zero.
    const item = montaItem(linha({ naoRespondidas: 1, esperaDesde: new Date(AGORA.getTime() + 20_000) }), AGORA);

    expect(item.esperandoHaSegundos).toBe(0);
  });

  it("o limiar de atraso continua sendo meia hora", () => {
    // É o ponto vermelho da tela, e o número que a literatura de vendas
    // aponta como queda acentuada de conversão.
    expect(ATRASO_SEGUNDOS).toBe(30 * 60);
  });
});
