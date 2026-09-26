import { AdminService } from "./admin.service";

describe("AdminService.excluiCliente", () => {
  const operador = { userId: "op-1", organizationId: "org-timeless", role: "OWNER" as const, impersonating: false };

  function monta(codigoValido = true) {
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: "org-1", name: "Dantas", brandColor: null }), update: jest.fn() },
      sessao: { updateMany: jest.fn() },
      $transaction: jest.fn(async (operacoes: unknown[]) => operacoes),
    };
    const auditoria = { registra: jest.fn() };
    const conexoes = { getCurrent: jest.fn().mockResolvedValue({ id: "wa-1" }), disconnect: jest.fn() };
    const links = { encerra: jest.fn() };
    const mfa = { confereSegundoFator: jest.fn().mockResolvedValue(codigoValido) };
    const service = new AdminService(prisma as never, {} as never, auditoria as never, conexoes as never, links as never, {} as never, mfa as never);
    return { service, prisma, conexoes, mfa };
  }

  it("frase errada: recusa sem gastar o código de verificação", async () => {
    const { service, mfa, prisma } = monta();

    await expect(service.excluiCliente(operador, "org-1", "quero excluir o dantas", "123456")).rejects.toMatchObject({
      response: { code: "CONFIRMACAO_INCORRETA" },
    });
    expect(mfa.confereSegundoFator).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("código errado: não exclui nada", async () => {
    const { service, prisma, conexoes } = monta(false);

    await expect(service.excluiCliente(operador, "org-1", "Quero excluir o Dantas", "000000")).rejects.toMatchObject({
      response: { code: "CODIGO_INVALIDO" },
    });
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(conexoes.disconnect).not.toHaveBeenCalled();
  });

  it("frase e código certos: desliga o WhatsApp, esconde o cliente e derruba as sessões dele", async () => {
    const { service, prisma, conexoes } = monta();

    await service.excluiCliente(operador, "org-1", "  Quero  excluir o Dantas ", "123 456");

    expect(conexoes.disconnect).toHaveBeenCalledWith("org-1");
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: "org-1" }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.sessao.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", encerradaEm: null } }));
  });

  it("não deixa excluir a conta da própria equipe", async () => {
    const { service } = monta();

    await expect(service.excluiCliente(operador, "org-timeless", "Quero excluir o Dantas", "123456")).rejects.toMatchObject({
      response: { code: "EXCLUSAO_PROIBIDA" },
    });
  });
});
