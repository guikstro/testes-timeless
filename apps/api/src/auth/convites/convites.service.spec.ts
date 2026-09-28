import { ConvitesService } from "./convites.service";

const mockRedis = (() => {
  const dados = new Map<string, string>();
  return {
    dados,
    set: async (chave: string, valor: string) => void dados.set(chave, valor),
    get: async (chave: string) => dados.get(chave) ?? null,
    getdel: async (chave: string) => {
      const valor = dados.get(chave) ?? null;
      dados.delete(chave);
      return valor;
    },
    quit: async () => undefined,
  };
})();
jest.mock("../../common/queue/redis-connection", () => ({ criaConexaoRedis: () => mockRedis }));

const tokenDe = (url: string) => url.split("/convite/")[1];

describe("ConvitesService", () => {
  const tx = {
    user: { create: jest.fn().mockResolvedValue({ id: "user-9" }), update: jest.fn() },
    membership: { create: jest.fn().mockResolvedValue({ role: "ADMIN" }), findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    organization: { findFirst: jest.fn().mockResolvedValue({ name: "Dantas" }) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const auth = { issueTokenPair: jest.fn().mockResolvedValue({ accessToken: "a", refreshToken: "r" }) };
  const service = new ConvitesService(prisma as never, auth as never);
  const paraOCliente = { organizationId: "org-1", email: "ana@x.com", papel: "MEMBER" as const, areas: ["conversas"], operador: false };

  beforeEach(() => {
    mockRedis.dados.clear();
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.membership.findFirst.mockResolvedValue(null);
    tx.membership.findUnique.mockResolvedValue(null);
    process.env.WEB_APP_URL = "https://site.exemplo.com";
  });

  it("guarda só o hash do token", async () => {
    const token = tokenDe((await service.cria(paraOCliente)).url);
    expect([...mockRedis.dados.keys(), ...mockRedis.dados.values()].join(" ")).not.toContain(token);
  });

  it("cria a pessoa no cliente certo, só com as áreas escolhidas e sem ser operadora", async () => {
    const token = tokenDe((await service.cria(paraOCliente)).url);
    await service.aceita(token, "Ana", "senha-forte-123");

    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "ana@x.com", platformRole: null }) });
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: { organizationId: "org-1", userId: "user-9", role: "MEMBER", areas: ["conversas"] },
    });
  });

  it("o link vale uma vez só", async () => {
    const token = tokenDe((await service.cria(paraOCliente)).url);
    await service.aceita(token, "Ana", "senha-forte-123");

    await expect(service.aceita(token, "Outra", "senha-forte-123")).rejects.toMatchObject({ response: { code: "CONVITE_INVALIDO" } });
  });

  it("convite da equipe Timeless cria a conta operadora", async () => {
    const token = tokenDe((await service.cria({ ...paraOCliente, papel: "ADMIN", areas: [], operador: true })).url);
    await service.aceita(token, "Bia", "senha-forte-123");

    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ platformRole: "ADMIN" }) });
  });

  it("recusa convidar quem já faz parte da conta", async () => {
    prisma.membership.findFirst.mockResolvedValueOnce({ userId: "existe" });
    await expect(service.cria(paraOCliente)).rejects.toMatchObject({ response: { code: "JA_FAZ_PARTE" } });
  });

  describe("quem já tem conta", () => {
    const daEquipe = { ...paraOCliente, papel: "ADMIN" as const, areas: [], operador: true };
    const sessao = { userId: "u-ana", organizationId: "org-dela", role: "OWNER", impersonating: false } as never;

    it("pode ser convidado, e a página sabe que é para entrar com a conta", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u-ana" });
      const token = tokenDe((await service.cria(daEquipe)).url);
      await expect(service.le(token)).resolves.toMatchObject({ contaExiste: true });
    });

    it("criar senha nova é recusado sem gastar o link", async () => {
      const token = tokenDe((await service.cria(daEquipe)).url);
      prisma.user.findUnique.mockResolvedValue({ id: "u-ana" });

      await expect(service.aceita(token, "Ana", "senha-forte-123")).rejects.toMatchObject({ response: { code: "EMAIL_ALREADY_IN_USE" } });
      await expect(service.le(token)).resolves.toMatchObject({ email: "ana@x.com" });
    });

    it("entrando com a conta do e-mail certo, entra na equipe e vira operadora", async () => {
      const token = tokenDe((await service.cria(daEquipe)).url);
      prisma.user.findUnique.mockResolvedValue({ email: "ana@x.com", platformRole: null, deletedAt: null });

      await service.aceitaComConta(token, sessao);

      expect(tx.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId: "org-1", userId: "u-ana", role: "ADMIN", areas: [] } }),
      );
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u-ana" }, data: { platformRole: "ADMIN" } });
      expect(auth.issueTokenPair).toHaveBeenCalledWith("u-ana", "org-1", "ADMIN", undefined, { contexto: undefined });
    });

    it("com a conta de outro e-mail, recusa e o link continua valendo", async () => {
      const token = tokenDe((await service.cria(daEquipe)).url);
      prisma.user.findUnique.mockResolvedValue({ email: "outra@x.com", platformRole: null, deletedAt: null });

      await expect(service.aceitaComConta(token, sessao)).rejects.toMatchObject({ response: { code: "CONVITE_DE_OUTRO_EMAIL" } });
      expect(tx.membership.create).not.toHaveBeenCalled();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.le(token)).resolves.toMatchObject({ email: "ana@x.com" });
    });
  });
});
