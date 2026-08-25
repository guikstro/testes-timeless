import { OrganizationsService } from "./organizations.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";

describe("OrganizationsService", () => {
  function buildService() {
    const prisma = {
      organization: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new OrganizationsService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it("scopes the lookup to the given organizationId — never trusts any other id source", async () => {
    const { service, prisma } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: "org-1", name: "Acme" });

    await service.getCurrent("org-1");

    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { id: "org-1", deletedAt: null },
    });
  });

  it("throws NOT_FOUND for a soft-deleted or nonexistent organization", async () => {
    const { service, prisma } = buildService();
    prisma.organization.findFirst.mockResolvedValue(null);

    await expect(service.getCurrent("org-does-not-exist")).rejects.toThrow(AppException);
  });

  it("never updates a different organization than the one the caller belongs to", async () => {
    const { service, prisma } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: "org-1", name: "Acme" });
    prisma.organization.update.mockResolvedValue({ id: "org-1", name: "New name" });

    await service.updateCurrent("org-1", { name: "New name" });

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { name: "New name" },
    });
  });
});
