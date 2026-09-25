import { AuditoriaService } from "../auditoria/auditoria.service";
import { TrackingLinksService } from "./tracking-links.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";

const AUTOR = { organizationId: "org-1", userId: "user-1" };

describe("TrackingLinksService", () => {
  function buildService() {
    const prisma = {
      trackingLink: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };
    const auditoria = { registra: jest.fn().mockResolvedValue(undefined) };
    const service = new TrackingLinksService(
      prisma as unknown as PrismaService,
      auditoria as unknown as AuditoriaService,
    );
    return { service, prisma, auditoria };
  }

  describe("create", () => {
    it("creates a link scoped to the caller's organization", async () => {
      const { service, prisma } = buildService();
      prisma.trackingLink.findUnique.mockResolvedValue(null);
      prisma.trackingLink.create.mockResolvedValue({ id: "link-1", code: "abc1234" });

      await service.create(AUTOR, { name: "Instagram Bio", destinationUrl: "https://wa.me/5585999999999" });

      expect(prisma.trackingLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          name: "Instagram Bio",
          destinationUrl: "https://wa.me/5585999999999",
          code: expect.any(String),
        }),
      });
    });

    it("retries code generation on an (astronomically unlikely) collision", async () => {
      const { service, prisma } = buildService();
      prisma.trackingLink.findUnique
        .mockResolvedValueOnce({ id: "existing-link" }) // first generated code collides
        .mockResolvedValueOnce(null); // second one is free
      prisma.trackingLink.create.mockResolvedValue({ id: "link-2" });

      await service.create(AUTOR, { name: "Link", destinationUrl: "https://example.com" });

      expect(prisma.trackingLink.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.trackingLink.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("findOne", () => {
    it("scopes the lookup to organizationId — a link from another tenant must not resolve", async () => {
      const { service, prisma } = buildService();
      prisma.trackingLink.findFirst.mockResolvedValue(null);

      await expect(service.findOne("org-1", "link-from-org-2")).rejects.toThrow(AppException);
      expect(prisma.trackingLink.findFirst).toHaveBeenCalledWith({
        where: { id: "link-from-org-2", organizationId: "org-1", deletedAt: null },
        include: { _count: { select: { clicks: true } } },
      });
    });
  });

  describe("remove", () => {
    it("soft-deletes instead of destroying click history", async () => {
      const { service, prisma } = buildService();
      prisma.trackingLink.findFirst.mockResolvedValue({ id: "link-1", organizationId: "org-1" });
      prisma.trackingLink.update.mockResolvedValue({});

      await service.remove(AUTOR, "link-1");

      expect(prisma.trackingLink.update).toHaveBeenCalledWith({
        where: { id: "link-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("registra a exclusão na auditoria, com o que o link era", async () => {
      const { service, prisma, auditoria } = buildService();
      prisma.trackingLink.findFirst.mockResolvedValue({
        id: "link-1",
        name: "Bio",
        destinationUrl: "https://wa.me/5585999999999",
        defaultSource: "instagram",
        defaultMedium: "bio",
        defaultCampaign: null,
      });

      await service.remove(AUTOR, "link-1");

      expect(auditoria.registra).toHaveBeenCalledWith(
        AUTOR,
        expect.objectContaining({
          acao: "TRACKING_LINK_DELETED",
          entidadeId: "link-1",
          antes: expect.objectContaining({ nome: "Bio", origem: "instagram" }),
        }),
      );
    });
  });
});
