import { OrganizationsService } from "./organizations.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { AppException } from "../common/exceptions/app-exception";

describe("OrganizationsService, gestão da equipe", () => {
  function buildService() {
    const prisma = {
      membership: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      refreshToken: { updateMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { service: new OrganizationsService(prisma as unknown as PrismaService), prisma };
  }

  const quem = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
    userId: "eu",
    organizationId: "org-1",
    role: "OWNER",
    impersonating: false,
    ...over,
  });

  const membro = (role: "OWNER" | "ADMIN" | "MEMBER") => ({ role, organizationId: "org-1", userId: "outro" });

  describe("remover", () => {
    it("recusa quem não é dono nem administrador", async () => {
      const { service, prisma } = buildService();

      await expect(service.removeMember(quem({ role: "MEMBER" }), "outro")).rejects.toThrow(AppException);
      // Nem chega a consultar: a permissão é verificada antes de tocar no banco.
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    });

    it("recusa remover a si mesmo", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("OWNER"));

      // Sair sozinho da conta deixaria a pessoa sem caminho de volta, e o
      // caso legítimo (quero sair) é outro fluxo, não este.
      await expect(service.removeMember(quem(), "eu")).rejects.toThrow("Você não pode remover a si mesmo. Peça a outro dono.");
    });

    it("recusa o administrador que tenta remover um dono", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("OWNER"));

      await expect(service.removeMember(quem({ role: "ADMIN" }), "outro")).rejects.toThrow(
        "Só um dono pode remover outro dono.",
      );
    });

    it("recusa remover o último dono", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("OWNER"));
      // Nenhum outro dono na organização.
      prisma.membership.count.mockResolvedValue(0);

      await expect(service.removeMember(quem(), "outro")).rejects.toThrow(
        "Esta é a única pessoa com papel de dono. Promova outra antes.",
      );
    });

    it("remove o vínculo e derruba as sessões, sem apagar a pessoa", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("MEMBER"));

      await service.removeMember(quem(), "outro");

      const operacoes = prisma.$transaction.mock.calls[0][0];
      expect(operacoes).toHaveLength(3);
      expect(prisma.membership.delete).toHaveBeenCalled();
      // A conta continua existindo: leads, mensagens e auditoria apontam para
      // ela, e apagá-la reescreveria o histórico de quem fez o quê.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "outro", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: "MEMBER_REMOVED", userId: "eu" }) }),
      );
    });
  });

  describe("mudar papel", () => {
    it("recusa mudar o próprio papel", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("OWNER"));

      await expect(service.updateMember(quem(), "eu", "MEMBER")).rejects.toThrow(
        "Você não pode mudar o seu próprio papel.",
      );
    });

    it("recusa o administrador que tenta criar um dono", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("MEMBER"));

      await expect(service.updateMember(quem({ role: "ADMIN" }), "outro", "OWNER")).rejects.toThrow(
        "Só um dono pode promover ou rebaixar outro dono.",
      );
    });

    it("recusa rebaixar o último dono", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("OWNER"));
      prisma.membership.count.mockResolvedValue(0);

      // Sem dono, ninguém poderia promover alguém depois: a organização
      // ficaria travada para sempre.
      await expect(service.updateMember(quem(), "outro", "ADMIN")).rejects.toThrow("Esta é a única pessoa com papel de dono. Promova outra antes.");
    });

    it("promove e registra o antes e o depois", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findUnique.mockResolvedValue(membro("MEMBER"));

      await expect(service.updateMember(quem(), "outro", "ADMIN")).resolves.toEqual({
        userId: "outro",
        role: "ADMIN",
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "MEMBER_ROLE_CHANGED",
            before: { role: "MEMBER" },
            after: { role: "ADMIN" },
          }),
        }),
      );
    });
  });

  it("listar não exige papel de gestão: todo mundo vê com quem divide a conta", async () => {
    const { service, prisma } = buildService();
    prisma.membership.findMany.mockResolvedValue([
      { role: "OWNER", createdAt: new Date(0), user: { id: "u1", name: "Ana", email: "ana@x.com" } },
    ]);

    await expect(service.listMembers("org-1")).resolves.toEqual([
      { userId: "u1", name: "Ana", email: "ana@x.com", role: "OWNER", joinedAt: new Date(0) },
    ]);
  });
});
