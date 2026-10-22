import { RelatorioSemanalService, semanas } from "./relatorio-semanal.service";

describe("semanas", () => {
  it("na segunda às 8h de Brasília, pega de segunda a domingo passados, e a semana antes", () => {
    // 26/10/2026 é segunda; 11h UTC são 8h em Brasília.
    expect(semanas(new Date("2026-10-26T11:00:00.000Z"))).toEqual({
      semana: { de: "2026-10-19", ate: "2026-10-25" },
      anterior: { de: "2026-10-12", ate: "2026-10-18" },
    });
  });
});

describe("RelatorioSemanalService", () => {
  function monta() {
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: "org-1", name: "Clínica" }]) },
      membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: "dona@clinica.test" } }]) },
    };
    const analytics = {
      desempenhoPorCampanha: jest.fn().mockResolvedValue({
        campanhas: [
          { nome: "Implante", atual: { leads: 5, clientes: 2 }, anterior: { leads: 3, clientes: 1 } },
          { nome: "Clareamento", atual: { leads: 4, clientes: 0 }, anterior: null },
        ],
        semCampanha: { atual: 1, anterior: 2 },
        totais: { leads: 9, clientes: 2, gastoCentavos: 80_000 },
      }),
    };
    const notificacoes = { notificar: jest.fn().mockResolvedValue(undefined) };
    const push = { enviarParaOrganizacao: jest.fn().mockResolvedValue(undefined) };
    const email = { enfileirar: jest.fn().mockResolvedValue(undefined) };
    const servico = new RelatorioSemanalService(
      prisma as never,
      analytics as never,
      notificacoes as never,
      push as never,
      email as never,
    );
    return { servico, prisma, notificacoes, push, email };
  }

  it("avisa no sino e no celular e manda o e-mail aos donos", async () => {
    const { servico, notificacoes, push, email } = monta();

    await servico.enviarParaTodas(new Date("2026-10-26T11:00:00.000Z"));

    expect(notificacoes.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "relatorio.semanal",
        organizationId: "org-1",
        title: "Sua semana: 10 contatos e 2 clientes novos",
      }),
    );
    expect(push.enviarParaOrganizacao).toHaveBeenCalledWith("org-1", expect.objectContaining({ url: "/dashboard?days=7" }));
    expect(email.enfileirar).toHaveBeenCalledWith(expect.objectContaining({ para: "dona@clinica.test" }));
    const { texto } = email.enfileirar.mock.calls[0][0] as { texto: string };
    expect(texto).toContain("Na semana anterior foram 5 contatos e 1 cliente.");
    expect(texto).toContain("Implante, com 2 clientes");
  });

  it("só procura quem ligou o relatório", async () => {
    const { servico, prisma } = monta();
    await servico.enviarParaTodas();
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { relatorioSemanal: true, deletedAt: null } }),
    );
  });
});
