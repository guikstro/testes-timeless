import { LeadsService } from "./leads.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";

describe("LeadsService", () => {
  function buildService() {
    const prisma = {
      lead: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      leadEvent: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      message: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      sale: { create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
      whatsAppConnection: { findUnique: jest.fn() },
      conversation: { findFirst: jest.fn(), update: jest.fn() },
      ad: { findUnique: jest.fn() },
      campaign: { findUnique: jest.fn() },
    };
    const conversionEvents = {
      recordLead: jest.fn(),
      recordQualifiedLead: jest.fn(),
      recordPurchase: jest.fn(),
    };
    const sendQueue = { add: jest.fn() };
    const service = new LeadsService(
      prisma as unknown as PrismaService,
      conversionEvents as unknown as ConversionEventsService,
      sendQueue as never,
    );
    return { service, prisma, conversionEvents, sendQueue };
  }

  it("scopes the list query to the caller's organization", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await service.list("org-1", { offset: 0, limit: 20 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("never resolves a lead belonging to another organization", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(service.findOne("org-1", "lead-from-org-2")).rejects.toThrow(AppException);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lead-from-org-2", organizationId: "org-1" } }),
    );
  });

  it("returns the lead's timeline (events) and message transcript together", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
    prisma.leadEvent.findMany.mockResolvedValue([{ type: "LEAD_CREATED" }]);
    prisma.message.findMany.mockResolvedValue([{ text: "oi" }]);

    const result = await service.findOne("org-1", "lead-1");

    expect(result.events).toEqual([{ type: "LEAD_CREATED" }]);
    expect(result.messages).toEqual([{ text: "oi" }]);
  });

  it("includes the lead's attribution and sale in the detail response", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findFirst.mockResolvedValue({
      id: "lead-1",
      organizationId: "org-1",
      attribution: { method: "TRACKING_LINK", trackingClick: { trackingLink: { name: "Bio do Instagram" } } },
      sale: { amountCents: 200000 },
    });

    const result = await service.findOne("org-1", "lead-1");

    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          attribution: { include: { trackingClick: { include: { trackingLink: true } } } },
          sale: true,
          conversionEvents: { orderBy: { occurredAt: "asc" } },
        },
      }),
    );
    expect(result.attribution).toMatchObject({ method: "TRACKING_LINK" });
    expect(result.sale).toMatchObject({ amountCents: 200000 });
  });

  describe("ficha do lead (Fase 10)", () => {
    const firstContactAt = new Date("2026-01-10T10:00:00.000Z");

    it("calcula as métricas de atendimento junto do detalhe", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        firstContactAt,
        qualifiedAt: null,
        wonAt: null,
      });
      prisma.message.findMany.mockResolvedValue([
        { direction: "INBOUND", timestamp: firstContactAt, outboundStatus: null },
        {
          direction: "OUTBOUND",
          timestamp: new Date(firstContactAt.getTime() + 90_000),
          outboundStatus: "SENT",
        },
      ]);

      const result = await service.findOne("org-1", "lead-1");

      expect(result.metrics).toMatchObject({
        firstResponseSeconds: 90,
        inboundCount: 1,
        outboundCount: 1,
        awaitingReply: false,
      });
    });

    it("resolve a hierarquia inteira do anúncio a partir do id do clique", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        firstContactAt,
        attribution: { evidence: null, trackingClick: { campaignId: null, adsetId: null, adId: "ad-ext" } },
      });
      prisma.ad.findUnique.mockResolvedValue({
        externalId: "ad-ext",
        name: "Criativo Vídeo 15s",
        adSet: {
          externalId: "set-ext",
          name: "Público Frio",
          campaign: { externalId: "camp-ext", name: "Campanha Agosto", organizationId: "org-1" },
        },
      });

      const result = await service.findOne("org-1", "lead-1");

      // Uma consulta só entrega anúncio, conjunto e campanha.
      expect(prisma.ad.findUnique).toHaveBeenCalledTimes(1);
      expect(result.adReferences).toEqual({
        ad: { externalId: "ad-ext", name: "Criativo Vídeo 15s" },
        adSet: { externalId: "set-ext", name: "Público Frio" },
        campaign: { externalId: "camp-ext", name: "Campanha Agosto" },
      });
    });

    /**
     * Ad e AdSet não carregam organizationId — o vínculo está só na campanha.
     * Sem esta verificação, um id de outra conta revelaria o nome do anúncio
     * dela.
     */
    it("não revela o nome de um anúncio de outra organização", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        firstContactAt,
        attribution: { evidence: null, trackingClick: { campaignId: null, adsetId: null, adId: "ad-ext" } },
      });
      prisma.ad.findUnique.mockResolvedValue({
        externalId: "ad-ext",
        name: "Criativo do concorrente",
        adSet: {
          externalId: "set-ext",
          name: "Não deveria aparecer",
          campaign: { externalId: "camp-ext", name: "Nem isto", organizationId: "outra-org" },
        },
      });

      const result = await service.findOne("org-1", "lead-1");

      expect(result.adReferences.ad).toEqual({ externalId: "ad-ext", name: null });
      expect(result.adReferences.adSet).toBeNull();
      expect(result.adReferences.campaign).toBeNull();
    });

    /** Sincronizar com a Meta é opcional: sem nome, o id cru ainda informa. */
    it("devolve o id cru quando o anúncio não foi sincronizado", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        firstContactAt,
        attribution: { evidence: { adId: "ad-nunca-sincronizado" }, trackingClick: null },
      });
      prisma.ad.findUnique.mockResolvedValue(null);

      const result = await service.findOne("org-1", "lead-1");

      expect(result.adReferences.ad).toEqual({ externalId: "ad-nunca-sincronizado", name: null });
    });

    it("não consulta anúncio nenhum para um lead sem atribuição", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        firstContactAt,
        attribution: null,
      });

      await service.findOne("org-1", "lead-1");

      expect(prisma.ad.findUnique).not.toHaveBeenCalled();
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
    });
  });

  it("includes attribution and sale on each item of the list, for the Origem/Campanha/Receita columns", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await service.list("org-1", { offset: 0, limit: 20 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { attribution: true, sale: true } }),
    );
  });

  describe("update (manual correction — Fase 5)", () => {
    function existingLead(overrides: Record<string, unknown> = {}) {
      return {
        id: "lead-1",
        organizationId: "org-1",
        status: "NEW",
        qualifiedAt: null,
        wonAt: null,
        sale: null,
        ...overrides,
      };
    }

    it("throws for a lead from another organization", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(service.update("org-1", "lead-x", "user-1", { status: "QUALIFIED" })).rejects.toThrow(
        AppException,
      );
    });

    it("rejects a backward or no-op status transition", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "QUALIFIED" }));

      await expect(
        service.update("org-1", "lead-1", "user-1", { status: "QUALIFIED" }),
      ).rejects.toMatchObject({ response: { code: "INVALID_STATUS_TRANSITION" } });
    });

    it("rejects setting revenue on a lead with no sale and no status change to WON", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findFirst.mockResolvedValue(existingLead());

      await expect(
        service.update("org-1", "lead-1", "user-1", { revenueCents: 5000 }),
      ).rejects.toMatchObject({ response: { code: "NO_SALE" } });
    });

    it("manually qualifying a NEW lead sets qualifiedAt, emits QUALIFIED, and audits the status change", async () => {
      const { service, prisma, conversionEvents } = buildService();
      prisma.lead.findFirst.mockResolvedValue(existingLead());
      prisma.lead.update.mockResolvedValue({});
      prisma.leadEvent.findMany.mockResolvedValue([]);
      prisma.message.findMany.mockResolvedValue([]);
      // findOne (called at the end of update) does a second findFirst — reuse the same mock.
      prisma.lead.findFirst.mockResolvedValueOnce(existingLead()).mockResolvedValueOnce(existingLead({ status: "QUALIFIED" }));

      await service.update("org-1", "lead-1", "user-1", { status: "QUALIFIED" });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { status: "QUALIFIED", qualifiedAt: expect.any(Date) },
      });
      const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
      expect(eventTypes).toEqual(["QUALIFIED"]);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "LEAD_STATUS_CHANGED",
          before: { status: "NEW" },
          after: { status: "QUALIFIED" },
          userId: "user-1",
        }),
      });
      expect(conversionEvents.recordQualifiedLead).toHaveBeenCalledWith("org-1", "lead-1", expect.any(Date));
    });

    it("manually marking WON with a revenue creates the Sale, audits SALE_CREATED, and records the Meta Purchase", async () => {
      const { service, prisma, conversionEvents } = buildService();
      prisma.lead.findFirst
        .mockResolvedValueOnce(existingLead({ status: "QUALIFIED", qualifiedAt: new Date(0) }))
        .mockResolvedValueOnce(existingLead({ status: "WON" }));
      prisma.lead.update.mockResolvedValue({});
      prisma.sale.create.mockResolvedValue({ id: "sale-1", amountCents: 200000 });

      await service.update("org-1", "lead-1", "user-1", { status: "WON", revenueCents: 200000 });

      expect(prisma.sale.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          leadId: "lead-1",
          amountCents: 200000,
          classifierType: "MANUAL",
          detectedAt: expect.any(Date),
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: "SALE_CREATED", entity: "Sale", entityId: "sale-1" }),
      });
      const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
      expect(eventTypes).toEqual(["SALE_DETECTED"]);
      expect(conversionEvents.recordPurchase).toHaveBeenCalledWith("org-1", "lead-1", expect.any(Date), 200000);
      // Was already QUALIFIED before this request — no implicit re-qualification sent to Meta.
      expect(conversionEvents.recordQualifiedLead).not.toHaveBeenCalled();
    });

    it("jumping straight from NEW to WON manually also synthesizes QUALIFIED, like the automatic classifier", async () => {
      const { service, prisma, conversionEvents } = buildService();
      prisma.lead.findFirst.mockResolvedValueOnce(existingLead()).mockResolvedValueOnce(existingLead({ status: "WON" }));
      prisma.lead.update.mockResolvedValue({});
      prisma.sale.create.mockResolvedValue({ id: "sale-1", amountCents: null });

      await service.update("org-1", "lead-1", "user-1", { status: "WON" });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { status: "WON", wonAt: expect.any(Date), qualifiedAt: expect.any(Date) },
      });
      const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
      expect(eventTypes).toEqual(["QUALIFIED", "SALE_DETECTED"]);
      expect(conversionEvents.recordQualifiedLead).toHaveBeenCalledWith("org-1", "lead-1", expect.any(Date));
      // No revenueCents given — value unknown, so no Purchase is sent yet.
      expect(conversionEvents.recordPurchase).not.toHaveBeenCalled();
    });

    it("correcting the revenue of an existing sale updates it, audits SALE_UPDATED with before/after, and records the Meta Purchase now that the value is known", async () => {
      const { service, prisma, conversionEvents } = buildService();
      prisma.lead.findFirst
        .mockResolvedValueOnce(existingLead({ status: "WON", wonAt: new Date(0), sale: { id: "sale-1", amountCents: 100000 } }))
        .mockResolvedValueOnce(existingLead({ status: "WON" }));
      prisma.sale.update.mockResolvedValue({ id: "sale-1", amountCents: 250000 });

      await service.update("org-1", "lead-1", "user-1", { revenueCents: 250000 });

      expect(prisma.sale.update).toHaveBeenCalledWith({ where: { id: "sale-1" }, data: { amountCents: 250000 } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "SALE_UPDATED",
          before: { amountCents: 100000 },
          after: { amountCents: 250000 },
        }),
      });
      const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
      expect(eventTypes).toEqual(["REVENUE_DETECTED"]);
      // ConversionEventsService itself dedupes on (leadId, type) — calling
      // this again for an already-sent Purchase is safe and a no-op there.
      expect(conversionEvents.recordPurchase).toHaveBeenCalledWith("org-1", "lead-1", expect.any(Date), 250000);
    });
  });
});
