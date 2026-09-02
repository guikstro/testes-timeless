import { ConversaBruta, MensagemBruta, montaLista, pendentes } from "./conversation-list";

const AGORA = new Date("2026-09-02T12:00:00.000Z");
const minutosAtras = (n: number) => new Date(AGORA.getTime() - n * 60_000);

function msg(direction: "INBOUND" | "OUTBOUND", minutos: number, text = "oi"): MensagemBruta {
  return { direction, type: "TEXT", text, timestamp: minutosAtras(minutos) };
}

function conversa(over: Partial<ConversaBruta> = {}): ConversaBruta {
  return {
    id: "c1",
    lastMessageAt: minutosAtras(1),
    lead: {
      id: "lead-1",
      name: "Ana",
      normalizedPhone: "+5511999999999",
      rawPhone: "5511999999999",
      status: "NEW",
      disqualifiedAt: null,
    },
    messages: [],
    ...over,
  };
}

describe("pendentes", () => {
  it("conta as mensagens do lead até esbarrar numa nossa", () => {
    // Da mais recente para a mais antiga: duas do lead, e antes delas uma
    // nossa, que encerra a contagem.
    const lista = pendentes([msg("INBOUND", 1), msg("INBOUND", 5), msg("OUTBOUND", 9), msg("INBOUND", 12)]);
    expect(lista).toHaveLength(2);
  });

  it("não conta nada quando a última palavra foi nossa", () => {
    expect(pendentes([msg("OUTBOUND", 1), msg("INBOUND", 5)])).toHaveLength(0);
  });
});

describe("montaLista", () => {
  it("descreve a conversa com prévia, contagem e espera", () => {
    const [item] = montaLista(
      [conversa({ messages: [msg("INBOUND", 10, "Quero saber o preço"), msg("INBOUND", 40), msg("OUTBOUND", 90)] })],
      AGORA,
    );

    expect(item.lastMessage).toEqual({
      direction: "INBOUND",
      text: "Quero saber o preço",
      timestamp: minutosAtras(10).toISOString(),
    });
    expect(item.unreadCount).toBe(2);
    expect(item.awaitingReply).toBe(true);
    // Quarenta minutos, e não dez: o lead espera desde a primeira que ficou
    // sem resposta, não desde a última que ele mandou.
    expect(item.esperandoHaSegundos).toBe(40 * 60);
  });

  it("normaliza a prévia para não quebrar a linha da lista", () => {
    const [item] = montaLista([conversa({ messages: [msg("INBOUND", 1, "  oi\n\n  tudo bem?  ")] })], AGORA);
    expect(item.lastMessage?.text).toBe("oi tudo bem?");
  });

  it("descreve mensagem sem texto em vez de deixar a linha vazia", () => {
    const [item] = montaLista(
      [conversa({ messages: [{ direction: "INBOUND", type: "OTHER", text: null, timestamp: minutosAtras(1) }] })],
      AGORA,
    );
    expect(item.lastMessage?.text).toBe("Mensagem não textual");
  });

  it("aceita conversa ainda sem nenhuma mensagem", () => {
    const [item] = montaLista([conversa({ messages: [] })], AGORA);
    expect(item.lastMessage).toBeNull();
    expect(item.unreadCount).toBe(0);
    expect(item.esperandoHaSegundos).toBeNull();
  });

  it("o filtro de não lidas deixa passar só quem tem mensagem sem resposta", () => {
    const lista = montaLista(
      [
        conversa({ id: "pendente", messages: [msg("INBOUND", 2)] }),
        conversa({ id: "respondida", messages: [msg("OUTBOUND", 1), msg("INBOUND", 2)] }),
      ],
      AGORA,
      "unread",
    );

    expect(lista.map((item) => item.id)).toEqual(["pendente"]);
  });

  it("o filtro de sem resposta separa o que está atrasado do que acabou de chegar", () => {
    const lista = montaLista(
      [
        conversa({ id: "recente", messages: [msg("INBOUND", 5)] }),
        conversa({ id: "atrasada", messages: [msg("INBOUND", 45)] }),
      ],
      AGORA,
      "awaiting",
    );

    // Os dois estão sem resposta; só um está esperando há tempo demais. Se os
    // dois filtros devolvessem o mesmo, um deles não teria razão de existir.
    expect(lista.map((item) => item.id)).toEqual(["atrasada"]);
  });
});
