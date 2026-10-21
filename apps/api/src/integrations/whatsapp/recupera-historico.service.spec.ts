import { RecuperaHistoricoService } from "./recupera-historico.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MotorWhatsApp } from "./motor-whatsapp";

describe("RecuperaHistoricoService", () => {
  const semEspera = () => Promise.resolve();

  function build() {
    const prisma = {
      whatsAppConnection: { findUnique: jest.fn().mockResolvedValue({ id: "conn-1" }) },
      conversation: {
        findMany: jest.fn().mockResolvedValue([
          { id: "c1", lead: { normalizedPhone: "+5585999999999", whatsappLid: null } },
          { id: "c2", lead: { normalizedPhone: "+5585988887777", whatsappLid: "123" } },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue({ externalId: "3EB0X", timestamp: new Date(1_700_000_000_000) }),
      },
    };
    const motor = { pedeHistorico: jest.fn().mockResolvedValue(true) };
    const service = new RecuperaHistoricoService(prisma as unknown as PrismaService, motor as unknown as MotorWhatsApp);
    return { service, prisma, motor };
  }

  it("pede o histórico de cada conversa recente, pelo LID quando conhecido, e marca como pedida", async () => {
    const { service, prisma, motor } = build();
    expect(await service.recupera("inst", semEspera)).toBe(2);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ whatsappConnectionId: "conn-1", historyRequestedAt: null }) }),
    );
    expect(motor.pedeHistorico).toHaveBeenNthCalledWith(
      1,
      "inst",
      { remoteJid: "5585999999999@s.whatsapp.net", fromMe: false, id: "3EB0X", timestampMs: 1_700_000_000_000 },
      50,
    );
    expect(motor.pedeHistorico.mock.calls[1][1]).toMatchObject({ remoteJid: "123@lid" });
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { historyRequestedAt: expect.any(Date) } });
  });

  it("para quando a conexão cai, sem marcar o resto como pedido", async () => {
    const { service, prisma, motor } = build();
    motor.pedeHistorico.mockResolvedValue(false);
    expect(await service.recupera("inst", semEspera)).toBe(0);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("nunca lança", async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockRejectedValue(new Error("banco fora"));
    await expect(service.recupera("inst", semEspera)).resolves.toBe(0);
  });
});
