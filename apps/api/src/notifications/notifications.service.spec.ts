const publish = jest.fn().mockResolvedValue(1);
const quit = jest.fn().mockResolvedValue("OK");

// O serviço abre a própria conexão no construtor. Trocá-la por um dublê é o
// que permite testar a publicação sem um Redis de verdade no caminho.
jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ publish, quit })),
}));

import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("NotificationsService", () => {
  function buildService(membros = [{ userId: "u-1" }, { userId: "u-2" }]) {
    const prisma = {
      membership: { findMany: jest.fn().mockResolvedValue(membros) },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: membros.length }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { service: new NotificationsService(prisma as unknown as PrismaService), prisma };
  }

  const evento = {
    type: "lead.created" as const,
    organizationId: "org-1",
    leadId: "lead-1",
    title: "Novo lead: Ana",
  };

  beforeEach(() => {
    publish.mockClear();
  });

  it("grava uma linha para cada pessoa da organização", async () => {
    const { service, prisma } = buildService();

    await service.notificar(evento);

    const linhas = prisma.notification.createMany.mock.calls[0][0].data;
    // Uma linha por pessoa, e não uma para a organização: o estado de leitura
    // é de quem lê, e uma linha só faria o aviso sumir da caixa do colega.
    expect(linhas.map((linha: { userId: string }) => linha.userId)).toEqual(["u-1", "u-2"]);
    expect(linhas[0]).toMatchObject({ organizationId: "org-1", type: "lead.created", leadId: "lead-1" });
  });

  it("publica no canal da própria organização", async () => {
    const { service } = buildService();

    await service.notificar(evento);

    expect(publish).toHaveBeenCalledWith("notifications:org-1", expect.any(String));
    expect(JSON.parse(publish.mock.calls[0][1])).toMatchObject({ type: "lead.created", organizationId: "org-1" });
  });

  it("carimba a hora quando quem publica não informou", async () => {
    const { service } = buildService();

    await service.notificar(evento);

    expect(Date.parse(JSON.parse(publish.mock.calls[0][1]).timestamp)).not.toBeNaN();
  });

  it("não deixa uma falha ao gravar derrubar quem chamou", async () => {
    // A ingestão do WhatsApp chama isto. Perder o aviso é um incômodo; deixar
    // o erro subir custaria a mensagem do lead, que é irrecuperável.
    const { service, prisma } = buildService();
    prisma.notification.createMany.mockRejectedValue(new Error("banco fora"));

    await expect(service.notificar(evento)).resolves.toBeUndefined();
    // E ainda assim anuncia: quem está com a tela aberta vê o lead chegar.
    expect(publish).toHaveBeenCalled();
  });

  it("não deixa uma falha ao publicar derrubar quem chamou", async () => {
    const { service } = buildService();
    publish.mockRejectedValueOnce(new Error("redis fora"));

    await expect(service.notificar(evento)).resolves.toBeUndefined();
  });

  it("não escreve nada quando a organização não tem ninguém", async () => {
    const { service, prisma } = buildService([]);

    await service.notificar(evento);

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("lista apenas a caixa de quem pediu", async () => {
    const { service, prisma } = buildService();

    await service.listar("u-1", { naoLidas: true, tipo: "lead.won" });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-1", type: "lead.won", read: false } }),
    );
  });

  it("marcar como lida não alcança a notificação de outra pessoa", async () => {
    const { service, prisma } = buildService();

    await service.marcarComoLida("u-1", "n-9");

    // O `userId` no filtro é o que impede alguém de mexer na caixa alheia
    // adivinhando um id.
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n-9", userId: "u-1" },
      data: { read: true },
    });
  });
});
