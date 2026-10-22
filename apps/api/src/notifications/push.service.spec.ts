jest.mock("web-push", () => ({
  generateVAPIDKeys: jest.fn().mockReturnValue({ publicKey: "PUB", privateKey: "PRIV" }),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

import * as webpush from "web-push";
import { PushService } from "./push.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { EncryptionService } from "../common/encryption/encryption.service";

describe("PushService", () => {
  function build(config: unknown = null) {
    const prisma = {
      pushConfig: {
        findUnique: jest.fn().mockResolvedValue(config),
        create: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn(),
      },
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const encryption = { encrypt: jest.fn((v: string) => `enc(${v})`), decrypt: jest.fn((v: string) => v.slice(4, -1)) };
    const service = new PushService(prisma as unknown as PrismaService, encryption as unknown as EncryptionService);
    return { service, prisma, encryption };
  }

  const aviso = { title: "João respondeu", body: "oi", url: "/conversas?lead=l1", tag: "lead-l1" };

  beforeEach(() => jest.clearAllMocks());

  it("gera as chaves na primeira vez e guarda a privada criptografada", async () => {
    const { service, prisma } = build();
    expect(await service.chavePublica()).toBe("PUB");
    expect(prisma.pushConfig.create).toHaveBeenCalledWith({
      data: { id: 1, publicKey: "PUB", privateKeyEnc: "enc(PRIV)" },
    });
  });

  it("reaproveita as chaves já guardadas, sem gerar outras", async () => {
    const { service, prisma } = build({ publicKey: "P2", privateKeyEnc: "enc(S2)" });
    expect(await service.chavePublica()).toBe("P2");
    expect(prisma.pushConfig.create).not.toHaveBeenCalled();
  });

  it("envia a todos os aparelhos da organização", async () => {
    const { service, prisma } = build({ publicKey: "P2", privateKeyEnc: "enc(S2)" });
    prisma.pushSubscription.findMany.mockResolvedValue([
      { id: "s1", endpoint: "https://push/1", p256dh: "k", auth: "a" },
      { id: "s2", endpoint: "https://push/2", p256dh: "k", auth: "a" },
    ]);
    await service.enviarParaOrganizacao("org-1", aviso);

    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect((webpush.sendNotification as jest.Mock).mock.calls[0][1]).toBe(JSON.stringify(aviso));
  });

  it("esquece o aparelho que desativou os avisos (410) e segue com os outros", async () => {
    const { service, prisma } = build({ publicKey: "P2", privateKeyEnc: "enc(S2)" });
    prisma.pushSubscription.findMany.mockResolvedValue([
      { id: "s1", endpoint: "https://push/1", p256dh: "k", auth: "a" },
      { id: "s2", endpoint: "https://push/2", p256dh: "k", auth: "a" },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await service.enviarParaOrganizacao("org-1", aviso);

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("nunca lança, nem quando o banco falha", async () => {
    const { service, prisma } = build();
    prisma.pushSubscription.findMany.mockRejectedValue(new Error("banco fora"));
    await expect(service.enviarParaOrganizacao("org-1", aviso)).resolves.toBeUndefined();
  });

  it("inscreve com upsert pelo endereço e cancela só o da própria pessoa", async () => {
    const { service, prisma } = build();
    const eu = { userId: "u1", organizationId: "org-1" };
    await service.inscrever(eu, { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" } }, "UA");
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { endpoint: "https://push/1" } }));
    await service.cancelar(eu, "https://push/1");
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: "https://push/1", userId: "u1", organizationId: "org-1" },
    });
  });

  it("manda cada tipo só para os aparelhos que querem aquele aviso", async () => {
    const { service, prisma } = build({ publicKey: "P2", privateKeyEnc: "enc(S2)" });
    await service.enviarParaOrganizacao("org-1", aviso, "message.received");
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", avisaMensagem: true } });
    await service.enviarParaOrganizacao("org-1", aviso, "lead.created");
    expect(prisma.pushSubscription.findMany).toHaveBeenLastCalledWith({ where: { organizationId: "org-1", avisaLeadNovo: true } });
  });

  it("lê e salva as preferências só do aparelho da própria pessoa", async () => {
    const { service, prisma } = build();
    const eu = { userId: "u1", organizationId: "org-1" };
    prisma.pushSubscription.findFirst.mockResolvedValue({ avisaLeadNovo: true, avisaMensagem: false });
    expect(await service.preferencias(eu, "https://push/1")).toEqual({ leadNovo: true, mensagem: false });

    expect(await service.salvaPreferencias(eu, "https://push/1", { leadNovo: false, mensagem: true })).toBe(true);
    expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { endpoint: "https://push/1", userId: "u1", organizationId: "org-1" },
      data: { avisaLeadNovo: false, avisaMensagem: true },
    });
  });
});
