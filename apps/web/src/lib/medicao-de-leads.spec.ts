import { medicaoDeLeads } from "./medicao-de-leads";

const conectado = { status: "CONNECTED" as const, createdAt: "2026-09-10T15:00:00.000Z" };

describe("medicaoDeLeads", () => {
  it("é medida sempre que houve lead, mesmo sem WhatsApp agora", () => {
    expect(medicaoDeLeads({ conexao: null, ate: "2026-09-30", leads: 3 })).toBe("medido");
    expect(
      medicaoDeLeads({ conexao: { ...conectado, status: "DISCONNECTED" }, ate: "2026-09-30", leads: 1 }),
    ).toBe("medido");
  });

  it("deixa o número como veio quando a conexão não pôde ser lida", () => {
    expect(medicaoDeLeads({ conexao: undefined, ate: "2026-09-30", leads: 0 })).toBe("medido");
  });

  it("não afirma zero quando nunca houve WhatsApp", () => {
    expect(medicaoDeLeads({ conexao: null, ate: "2026-09-30", leads: 0 })).toBe("sem-whatsapp");
  });

  it("não afirma zero num período que acabou antes da conexão", () => {
    expect(medicaoDeLeads({ conexao: conectado, ate: "2026-08-31", leads: 0 })).toBe("antes-do-whatsapp");
  });

  it("conta o dia da conexão no fuso de Brasília", () => {
    // 01h UTC do dia 11 ainda é dia 10 em Brasília.
    const tarde = { status: "CONNECTED" as const, createdAt: "2026-09-11T01:00:00.000Z" };
    expect(medicaoDeLeads({ conexao: tarde, ate: "2026-09-10", leads: 0 })).toBe("medido");
  });

  it("põe o zero em dúvida quando o WhatsApp está fora agora", () => {
    expect(
      medicaoDeLeads({ conexao: { ...conectado, status: "PENDING_QR" }, ate: "2026-09-30", leads: 0 }),
    ).toBe("whatsapp-fora");
  });

  it("aceita o zero como medida com o WhatsApp conectado", () => {
    expect(medicaoDeLeads({ conexao: conectado, ate: "2026-09-30", leads: 0 })).toBe("medido");
  });
});
