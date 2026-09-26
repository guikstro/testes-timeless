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
  const tx = { user: { create: jest.fn().mockResolvedValue({ id: "user-9" }) }, membership: { create: jest.fn() } };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    organization: { findFirst: jest.fn().mockResolvedValue({ name: "Dantas" }) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const auth = { issueTokenPair: jest.fn().mockResolvedValue({ accessToken: "a", refreshToken: "r" }) };
  const service = new ConvitesService(prisma as never, auth as never);
  const paraOCliente = { organizationId: "org-1", email: "ana@x.com", papel: "MEMBER" as const, areas: ["conversas"], operador: false };

  beforeEach(() => {
    mockRedis.dados.clear();
    jest.clearAllMocks();
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

  it("recusa convidar um e-mail que já tem conta", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "existe" });
    await expect(service.cria(paraOCliente)).rejects.toMatchObject({ response: { code: "EMAIL_ALREADY_IN_USE" } });
  });
});
