import { AuditoriaService } from "../auditoria/auditoria.service";
import { OrganizationsService } from "./organizations.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { AppException } from "../common/exceptions/app-exception";
import { ArmazenamentoService } from "./upload/armazenamento.service";

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
      sessao: { updateMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: "Bia", email: "bia@x.com" }), findMany: jest.fn() },
      userMfa: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    // A remoção roda numa transação interativa: o callback recebe o próprio
    // mock, e o teste confere as escritas que aconteceram dentro dela.
    prisma.$transaction.mockImplementation((executar: (tx: typeof prisma) => unknown) => executar(prisma));
    const auth = { issueTokenPair: jest.fn().mockResolvedValue({ accessToken: "a", refreshToken: "r" }) };
    const mfa = { confereSegundoFator: jest.fn().mockResolvedValue(true) };
    const armazenamento = {
      guardar: jest.fn().mockResolvedValue("abc.png"),
      apagarPelaUrl: jest.fn().mockResolvedValue(undefined),
      ler: jest.fn(),
      etagDe: jest.fn(),
    };
    return {
      service: new OrganizationsService(
        prisma as unknown as PrismaService,
        armazenamento as unknown as ArmazenamentoService,
        new AuditoriaService(prisma as unknown as PrismaService),
        auth as never,
        mfa as never,
      ),
      prisma,
      armazenamento,
      auth,
      mfa,
    };
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
        "Só um dono pode promover, rebaixar ou remover outro dono.",
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

      // Tudo numa transação só, a auditoria junto: se o registro falhar, a
      // remoção não acontece.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.membership.delete).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "MEMBER_REMOVED",
            // O nome de quem saiu fica no registro: depois da remoção, o id
            // sozinho não diz nada a quem lê.
            before: { role: "MEMBER", nome: "Bia", email: "bia@x.com" },
          }),
        }),
      );
      // A conta continua existindo: leads, mensagens e auditoria apontam para
      // ela, e apagá-la reescreveria o histórico de quem fez o quê.

      // Só as renovações desta organização, mais as antigas sem sessão, que
      // não têm como dizer de qual organização são.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "outro",
          revokedAt: null,
          OR: [{ sessaoId: null }, { sessao: { organizationId: "org-1" } }],
        },
        data: { revokedAt: expect.any(Date) },
      });
      // E a sessão, para o token de acesso cair na hora. Só a desta
      // organização: a pessoa pode pertencer a outras, e ser removida daqui
      // não é motivo para perder o acesso de lá.
      expect(prisma.sessao.updateMany).toHaveBeenCalledWith({
        where: { userId: "outro", organizationId: "org-1", encerradaEm: null },
        data: { encerradaEm: expect.any(Date), motivoDoEncerramento: "removido da organização" },
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
        "Só um dono pode promover, rebaixar ou remover outro dono.",
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
            before: { role: "MEMBER", nome: "Bia", email: "bia@x.com" },
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
      { userId: "u1", name: "Ana", email: "ana@x.com", role: "OWNER", joinedAt: new Date(0), daEquipe: false },
    ]);
  });

  describe("transferir a posse da conta da equipe", () => {
    const dono = { userId: "eu", organizationId: "org-equipe", role: "OWNER", impersonating: false, sessaoId: "s1", areas: null } as AuthenticatedUser;

    function daEquipe(opcoes: { alvoDaEquipe?: boolean; souOperador?: boolean } = {}) {
      const montado = buildService();
      const { prisma } = montado;
      prisma.user.findUnique.mockResolvedValue({ platformRole: opcoes.souOperador === false ? null : "ADMIN" });
      prisma.membership.findUnique.mockResolvedValue({ role: "ADMIN" });
      prisma.user.findMany.mockResolvedValue([
        { id: "eu", name: "Adriano", email: "a@x.com", platformRole: "ADMIN", deletedAt: null },
        { id: "gui", name: "Guilherme", email: "g@x.com", platformRole: opcoes.alvoDaEquipe === false ? null : "ADMIN", deletedAt: null },
      ]);
      return montado;
    }

    it("passa a posse, rebaixa quem transferiu a administrador e devolve a sessão com o papel novo", async () => {
      const { service, prisma, auth } = daEquipe();

      await service.transferePosse(dono, "gui", "123 456");

      expect(prisma.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId_userId: { organizationId: "org-equipe", userId: "gui" } }, data: { role: "OWNER", areas: [] } }),
      );
      expect(prisma.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId_userId: { organizationId: "org-equipe", userId: "eu" } }, data: { role: "ADMIN" } }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: "OWNERSHIP_TRANSFERRED" }) }),
      );
      expect(auth.issueTokenPair).toHaveBeenCalledWith("eu", "org-equipe", "ADMIN", undefined, { id: "s1" });
    });

    it("nunca para quem não é da equipe", async () => {
      const { service, prisma } = daEquipe({ alvoDaEquipe: false });
      await expect(service.transferePosse(dono, "gui", "123456")).rejects.toMatchObject({ response: { code: "SO_PARA_A_EQUIPE" } });
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it("não existe fora da conta da equipe", async () => {
      const { service } = daEquipe({ souOperador: false });
      await expect(service.transferePosse(dono, "gui", "123456")).rejects.toMatchObject({ response: { code: "TRANSFERENCIA_PROIBIDA" } });
    });

    it("não vale numa visita de suporte", async () => {
      const { service } = daEquipe();
      await expect(service.transferePosse({ ...dono, impersonating: true }, "gui", "123456")).rejects.toMatchObject({
        response: { code: "TRANSFERENCIA_PROIBIDA" },
      });
    });

    it("código errado não muda nada", async () => {
      const { service, prisma, mfa } = daEquipe();
      mfa.confereSegundoFator.mockResolvedValue(false);
      prisma.userMfa.findFirst.mockResolvedValue({ userId: "eu" });

      await expect(service.transferePosse(dono, "gui", "000000")).rejects.toMatchObject({ response: { code: "CODIGO_INVALIDO" } });
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it("sem autenticador configurado, pede para ativar antes", async () => {
      const { service, prisma, mfa } = daEquipe();
      mfa.confereSegundoFator.mockResolvedValue(false);
      prisma.userMfa.findFirst.mockResolvedValue(null);

      await expect(service.transferePosse(dono, "gui", "000000")).rejects.toMatchObject({ response: { code: "MFA_OBRIGATORIO" } });
    });

    it("só o dono transfere", async () => {
      const { service } = daEquipe();
      await expect(service.transferePosse({ ...dono, role: "ADMIN" }, "gui", "123456")).rejects.toMatchObject({
        response: { code: "OWNER_REQUIRED" },
      });
    });

    it("na conta da equipe, promover a dono pela troca de papel é recusado: tem de ser pela transferência", async () => {
      const { service } = daEquipe();
      await expect(service.updateMember(dono, "gui", "OWNER")).rejects.toMatchObject({ response: { code: "USE_A_TRANSFERENCIA" } });
    });
  });
});
