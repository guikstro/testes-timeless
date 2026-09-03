import { atendimentoPorLead } from "./atendimento-por-lead";
import { PrismaService } from "../common/prisma/prisma.service";

describe("atendimentoPorLead", () => {
  function montar(linhas: unknown[] = []) {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(linhas) };
    return { prisma, comoPrisma: prisma as unknown as PrismaService };
  }

  it("não vai ao banco quando não há lead nenhum", async () => {
    const { prisma, comoPrisma } = montar();

    const mapa = await atendimentoPorLead(comoPrisma, []);

    expect(mapa.size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("indexa por lead", async () => {
    const recebido = new Date("2026-01-01T12:00:00Z");
    const respondido = new Date("2026-01-01T12:05:00Z");
    const { comoPrisma } = montar([
      { leadId: "lead-1", primeiroRecebido: recebido, primeiraResposta: respondido, ultimoSentido: "OUTBOUND" },
      { leadId: "lead-2", primeiroRecebido: recebido, primeiraResposta: null, ultimoSentido: "INBOUND" },
    ]);

    const mapa = await atendimentoPorLead(comoPrisma, ["lead-1", "lead-2"]);

    expect(mapa.get("lead-1")).toEqual({
      primeiroRecebido: recebido,
      primeiraResposta: respondido,
      ultimoSentido: "OUTBOUND",
    });
    expect(mapa.get("lead-2")?.primeiraResposta).toBeNull();
  });

  it("devolve vazio para um lead sem mensagem nenhuma", async () => {
    const { comoPrisma } = montar([]);

    const mapa = await atendimentoPorLead(comoPrisma, ["lead-sem-mensagem"]);

    // Sem linha é diferente de linha com nulos: quem pergunta trata os dois
    // como "não dá para saber", que é o que `computeLeadMetrics` já faz.
    expect(mapa.get("lead-sem-mensagem")).toBeUndefined();
  });
});
