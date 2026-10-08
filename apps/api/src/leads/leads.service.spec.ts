import { AuditoriaService } from "../auditoria/auditoria.service";
import { LeadsService } from "./leads.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";

describe("LeadsService", () => {
  function buildService() {
    const prisma = {
      lead: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      membership: { findFirst: jest.fn(), findMany: jest.fn() },
      leadEvent: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      message: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      sale: { create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ name: "Ana", email: "ana@x.com" }) },
      whatsAppConnection: { findUnique: jest.fn() },
      conversation: { findFirst: jest.fn(), update: jest.fn() },
      ad: { findFirst: jest.fn() },
      campaign: { findFirst: jest.fn() },
      organization: { findUnique: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "BRL" }) },
    };
    const conversionEvents = {
      recordLead: jest.fn(),
      recordQualifiedLead: jest.fn(),
      recordPurchase: jest.fn(),
    };
    const sendQueue = { add: jest.fn() };
    const notifications = { notificar: jest.fn().mockResolvedValue(undefined) };
    const sales = { record: jest.fn() };
    const service = new LeadsService(
      prisma as unknown as PrismaService,
      conversionEvents as unknown as ConversionEventsService,
      sendQueue as never,
      notifications as never,
      new AuditoriaService(prisma as unknown as PrismaService),
      sales as never,
    );
    return { service, prisma, conversionEvents, sendQueue, notifications, sales };
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
      sales: [{ amountCents: 200000, status: "CONFIRMED", needsReview: false }],
    });

    const result = await service.findOne("org-1", "lead-1");

    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          attribution: { include: { trackingClick: { include: { trackingLink: true } } } },
          sales: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 },
          responsavel: { select: { id: true, name: true } },
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
      prisma.ad.findFirst.mockResolvedValue({
        externalId: "ad-ext",
        name: "Criativo Vídeo 15s",
        adSet: {
          externalId: "set-ext",
          name: "Público Frio",
          campaign: { externalId: "camp-ext", name: "Campanha Agosto", organizationId: "org-1" },
        },
      });

      const result = await service.findOne("org-1", "lead-1");

      // Uma consulta só entrega anúncio, conjunto e campanha, e ela já desce
      // pela campanha para nunca alcançar a conta de outro cliente.
      expect(prisma.ad.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.ad.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { externalId: "ad-ext", adSet: { campaign: { organizationId: "org-1" } } },
        }),
      );
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
      // O anúncio existe, mas é de outra organização: a consulta não o
      // alcança, porque o escopo entra nela em vez de virar conferência
      // depois. `externalId` deixou de ser único no sistema inteiro
      // justamente para este id poder existir nas duas contas.
      prisma.ad.findFirst.mockResolvedValue(null);
      prisma.campaign.findFirst.mockResolvedValue(null);

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
      prisma.ad.findFirst.mockResolvedValue(null);

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

      expect(prisma.ad.findFirst).not.toHaveBeenCalled();
      expect(prisma.campaign.findFirst).not.toHaveBeenCalled();
    });
  });

  it("includes attribution and sale on each item of the list, for the Origem/Campanha/Receita columns", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await service.list("org-1", { offset: 0, limit: 20 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ attribution: true, sales: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 } }),
      }),
    );
  });

  describe("update (manual correction — Fase 5)", () => {
    function existingLead(overrides: Record<string, unknown> = {}) {
      return {
        id: "lead-1",
        organizationId: "org-1",
        status: "NEW",
        // Obrigatório no schema — todo lead nasce de uma mensagem.
        firstContactAt: new Date("2026-01-10T10:00:00Z"),
        qualifiedAt: null,
        meetingScheduledAt: null,
        wonAt: null,
        disqualifiedAt: null,
        disqualifiedReason: null,
        sales: [],
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

    it("sends explicit manual value to the resolution engine", async () => {
      const { service, prisma, sales, conversionEvents } = buildService();
      prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "QUALIFIED" }));
      await service.update("org-1", "lead-1", "user-1", { status: "WON", revenueCents: 200000 });
      expect(sales.record).toHaveBeenCalledWith(expect.objectContaining({ source: "MANUAL", type: "MANUAL_CONFIRMATION", valueCents: 200000, actorId: "user-1", leadId: "lead-1" }));
      expect(prisma.sale.create).not.toHaveBeenCalled();
      expect(conversionEvents.recordPurchase).not.toHaveBeenCalled();
    });

    it("WON alone never confirms revenue", async () => {
      const { service, prisma, sales } = buildService();
      prisma.lead.findFirst.mockResolvedValue(existingLead());
      await service.update("org-1", "lead-1", "user-1", { status: "WON" });
      expect(sales.record).not.toHaveBeenCalled();
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it("correcting revenue appends evidence to the existing sale", async () => {
      const { service, prisma, sales } = buildService();
      prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "WON", sales: [{ id: "sale-1", amountCents: 100000, detectedAt: new Date("2026-10-01T12:00:00Z") }] }));
      await service.update("org-1", "lead-1", "user-1", { revenueCents: 250000 });
      expect(sales.record).toHaveBeenCalledWith(expect.objectContaining({ saleId: "sale-1", valueCents: 250000, actorId: "user-1" }));
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });

    it("traz a última mensagem de cada lead na listagem", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        conversations: [
          { messages: [{ direction: "INBOUND", text: "oi", timestamp: new Date("2026-01-02T10:00:00Z") }] },
        ],
      },
    ]);
    prisma.lead.count.mockResolvedValue(1);

    const resultado = await service.list("org-1", { offset: 0, limit: 20 });
    const item = resultado.items[0] as { lastMessage: unknown; awaitingReply: boolean; conversations?: unknown };

    expect(item.lastMessage).toMatchObject({ text: "oi", direction: "INBOUND" });
    // Última mensagem do lead significa que a bola está com a equipe.
    expect(item.awaitingReply).toBe(true);
    // A tela não precisa saber que existem conversas; o campo achatado basta.
    expect(item.conversations).toBeUndefined();
  });

  it("marca como não aguardando quando a equipe falou por último", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        conversations: [
          { messages: [{ direction: "OUTBOUND", text: "respondido", timestamp: new Date() }] },
        ],
      },
    ]);
    prisma.lead.count.mockResolvedValue(1);

    const resultado = await service.list("org-1", { offset: 0, limit: 20 });

    expect((resultado.items[0] as { awaitingReply: boolean }).awaitingReply).toBe(false);
  });

  it("trata um lead sem conversa nenhuma", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([{ id: "lead-1", conversations: [] }]);
    prisma.lead.count.mockResolvedValue(1);

    const resultado = await service.list("org-1", { offset: 0, limit: 20 });
    const item = resultado.items[0] as { lastMessage: unknown; awaitingReply: boolean };

    expect(item.lastMessage).toBeNull();
    expect(item.awaitingReply).toBe(false);
  });

  describe("reunião marcada e desqualificação (Fase 11)", () => {
      function updateData(prisma: { lead: { update: jest.Mock } }) {
        return prisma.lead.update.mock.calls[0][0].data;
      }

      it("registra a data ao marcar reunião", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "QUALIFIED", qualifiedAt: new Date() }));

        await service.update("org-1", "lead-1", "user-1", { status: "MEETING_SCHEDULED" });

        expect(updateData(prisma)).toMatchObject({
          status: "MEETING_SCHEDULED",
          meetingScheduledAt: expect.any(Date),
        });
      });

      /** Combinar horário pressupõe ter qualificado, mesmo sem mensagem de qualificação. */
      it("qualifica implicitamente ao marcar reunião de um lead novo", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "NEW" }));

        await service.update("org-1", "lead-1", "user-1", { status: "MEETING_SCHEDULED" });

        expect(updateData(prisma).qualifiedAt).toEqual(expect.any(Date));
      });

      /**
       * A assimetria importa: qualificação é pressuposto de uma venda, reunião
       * não é. Vender sem reunião é comum, e inventar uma falsearia o funil.
       */
      it("não inventa uma reunião ao marcar venda", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "QUALIFIED", qualifiedAt: new Date() }));
        prisma.sale.create.mockResolvedValue({ id: "sale-1", amountCents: null });

        await service.update("org-1", "lead-1", "user-1", { status: "WON" });

        expect(updateData(prisma).meetingScheduledAt).toBeUndefined();
      });

      it("recusa voltar de venda para reunião", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "WON" }));

        await expect(
          service.update("org-1", "lead-1", "user-1", { status: "MEETING_SCHEDULED" }),
        ).rejects.toMatchObject({ response: { code: "INVALID_STATUS_TRANSITION" } });
      });

      it("desqualifica guardando o motivo, sem espaços em volta", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead());

        await service.update("org-1", "lead-1", "user-1", {
          disqualified: true,
          disqualifiedReason: "  Sem verba  ",
        });

        expect(updateData(prisma)).toMatchObject({
          disqualifiedAt: expect.any(Date),
          disqualifiedReason: "Sem verba",
        });
      });

      /** Saída lateral do funil: o lead preserva o estágio a que chegou. */
      it("não mexe no status ao desqualificar", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "QUALIFIED", qualifiedAt: new Date() }));

        await service.update("org-1", "lead-1", "user-1", { disqualified: true });

        expect(updateData(prisma).status).toBeUndefined();
      });

      it("recusa desqualificar quem já comprou", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "WON" }));

        await expect(
          service.update("org-1", "lead-1", "user-1", { disqualified: true }),
        ).rejects.toMatchObject({ response: { code: "CANNOT_DISQUALIFY_WON" } });
      });

      it("recusa desqualificar e vender na mesma chamada", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ status: "QUALIFIED", qualifiedAt: new Date() }));

        await expect(
          service.update("org-1", "lead-1", "user-1", { status: "WON", disqualified: true }),
        ).rejects.toMatchObject({ response: { code: "CANNOT_DISQUALIFY_WON" } });
      });

      it("reativa limpando data e motivo", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(
          existingLead({ disqualifiedAt: new Date(), disqualifiedReason: "Sem verba" }),
        );

        await service.update("org-1", "lead-1", "user-1", { disqualified: false });

        expect(updateData(prisma)).toMatchObject({ disqualifiedAt: null, disqualifiedReason: null });
      });

      /** Se a pessoa voltou e avançou, exigir dois passos seria atrito sem ganho. */
      it("reativa sozinho quando o lead volta a avançar", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(
          existingLead({ status: "NEW", disqualifiedAt: new Date(), disqualifiedReason: "Sem verba" }),
        );

        await service.update("org-1", "lead-1", "user-1", { status: "QUALIFIED" });

        expect(updateData(prisma)).toMatchObject({ status: "QUALIFIED", disqualifiedAt: null });
      });

      it("registra a desqualificação na auditoria e na timeline", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead());

        await service.update("org-1", "lead-1", "user-1", { disqualified: true, disqualifiedReason: "Engano" });

        expect(prisma.leadEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ type: "DISQUALIFIED" }) }),
        );
        expect(prisma.auditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ action: "LEAD_DISQUALIFIED" }) }),
        );
      });

      it("não redesqualifica um lead já desqualificado", async () => {
        const { service, prisma } = buildService();
        prisma.lead.findFirst.mockResolvedValue(existingLead({ disqualifiedAt: new Date("2026-01-01") }));

        await service.update("org-1", "lead-1", "user-1", { disqualified: true });

        // Sem nada novo para gravar, a data original é preservada.
        expect(prisma.lead.update).not.toHaveBeenCalled();
      });
    });
  });

  describe("acompanhamento do lead (item 14)", () => {
    function lead(overrides: Record<string, unknown> = {}) {
      return {
        id: "lead-1",
        organizationId: "org-1",
        name: "Carla",
        rawPhone: "+5585999990000",
        status: "NEW",
        firstContactAt: new Date("2026-01-10T10:00:00Z"),
        qualifiedAt: null,
        meetingScheduledAt: null,
        wonAt: null,
        disqualifiedAt: null,
        disqualifiedReason: null,
        emAtendimentoAt: null,
        responsavelId: null,
        sales: [],
        ...overrides,
      };
    }

    function comLead(overrides: Record<string, unknown> = {}) {
      const montado = buildService();
      montado.prisma.lead.findFirst.mockResolvedValue(lead(overrides));
      montado.prisma.lead.update.mockResolvedValue({});
      return montado;
    }

    it("marca em atendimento à mão a partir de novo, sem avisar a equipe", async () => {
      const { service, prisma, notifications } = comLead();

      await service.update("org-1", "lead-1", "user-1", { status: "IN_PROGRESS" });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { status: "IN_PROGRESS", emAtendimentoAt: expect.any(Date) },
      });
      expect(prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type)).toEqual(["ATTENDANCE_STARTED"]);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: "LEAD_STATUS_CHANGED", after: { status: "IN_PROGRESS" } }),
      });
      expect(notifications.notificar).not.toHaveBeenCalled();
    });

    it("qualifica a partir de em atendimento, e não volta para ele", async () => {
      const { service, prisma } = comLead({ status: "IN_PROGRESS" });

      await service.update("org-1", "lead-1", "user-1", { status: "QUALIFIED" });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { status: "QUALIFIED", qualifiedAt: expect.any(Date) },
      });

      const outro = comLead({ status: "QUALIFIED" });
      await expect(outro.service.update("org-1", "lead-1", "user-1", { status: "IN_PROGRESS" })).rejects.toMatchObject({
        response: { code: "INVALID_STATUS_TRANSITION" },
      });
    });

    it("recusa responsável que não é da organização", async () => {
      const { service, prisma } = comLead();
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.update("org-1", "lead-1", "user-1", { responsavelId: "8b1d9d8e-3f7a-4c2b-9d1e-0a6b5c4d3e2f" }),
      ).rejects.toMatchObject({ response: { code: "RESPONSAVEL_INVALIDO" } });
      expect(prisma.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }),
      );
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it("troca o responsável e conta na linha do tempo quem ficou com o lead", async () => {
      const { service, prisma } = comLead({ responsavelId: "user-1" });
      prisma.membership.findFirst.mockResolvedValue({ user: { id: "user-2", name: "Bia" } });

      await service.update("org-1", "lead-1", "user-1", { responsavelId: "user-2" });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { responsavel: { connect: { id: "user-2" } } },
      });
      expect(prisma.leadEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "OWNER_ASSIGNED",
          metadata: expect.objectContaining({ responsavelId: "user-2", responsavelNome: "Bia", automatico: false }),
        }),
      });
    });

    it("limpa o responsável com null, e guarda valor e próxima ação", async () => {
      const { service, prisma } = comLead({ responsavelId: "user-1" });

      await service.update("org-1", "lead-1", "user-1", {
        responsavelId: null,
        valorPotencialCentavos: 150_000,
        proximaAcao: "  Ligar para fechar  ",
        proximaAcaoEm: "2026-10-02",
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: {
          responsavel: { disconnect: true },
          valorPotencialCentavos: 150_000,
          proximaAcao: "Ligar para fechar",
          proximaAcaoEm: new Date("2026-10-02"),
        },
      });
    });

    describe("quem responde primeiro vira o responsável", () => {
      function prontoParaEnviar(overrides: Record<string, unknown> = {}) {
        const montado = comLead(overrides);
        montado.prisma.whatsAppConnection.findUnique.mockResolvedValue({ id: "conn-1", status: "CONNECTED" });
        montado.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
        montado.prisma.message.create.mockResolvedValue({ id: "msg-1" });
        montado.prisma.membership.findFirst.mockResolvedValue({ user: { name: "Ana" } });
        montado.prisma.lead.updateMany.mockResolvedValue({ count: 1 });
        return montado;
      }

      it("assume o lead sem responsável, com evento automático", async () => {
        const { service, prisma } = prontoParaEnviar();

        await service.sendMessage("org-1", "lead-1", { text: "Oi, Carla!" }, "user-1");

        expect(prisma.lead.updateMany).toHaveBeenCalledWith({
          where: { id: "lead-1", organizationId: "org-1", responsavelId: null },
          data: { responsavelId: "user-1" },
        });
        expect(prisma.leadEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ type: "OWNER_ASSIGNED", metadata: expect.objectContaining({ automatico: true }) }),
        });
      });

      it("não troca quem já é responsável, e a visita do suporte não assume", async () => {
        const comDono = prontoParaEnviar({ responsavelId: "user-9" });
        await comDono.service.sendMessage("org-1", "lead-1", { text: "Oi" }, "user-1");
        expect(comDono.prisma.lead.updateMany).not.toHaveBeenCalled();

        const suporte = prontoParaEnviar();
        await suporte.service.sendMessage("org-1", "lead-1", { text: "Oi" }, "operador-1", true);
        expect(suporte.prisma.lead.updateMany).not.toHaveBeenCalled();
      });

      it("se outra resposta assumiu antes, não registra evento", async () => {
        const { service, prisma } = prontoParaEnviar();
        prisma.lead.updateMany.mockResolvedValue({ count: 0 });

        await service.sendMessage("org-1", "lead-1", { text: "Oi" }, "user-1");

        expect(prisma.leadEvent.create).not.toHaveBeenCalled();
      });
    });

    it("filtra a lista por responsável: eu, ninguém ou uma pessoa", async () => {
      const { service, prisma } = buildService();
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.list("org-1", { responsavel: "eu" }, "user-1");
      await service.list("org-1", { responsavel: "nenhum" }, "user-1");

      const filtros = prisma.lead.findMany.mock.calls.map((c) => c[0].where.responsavelId);
      expect(filtros).toEqual(["user-1", null]);
    });

    it("lista as pessoas da organização em ordem de nome", async () => {
      const { service, prisma } = buildService();
      prisma.membership.findMany.mockResolvedValue([{ user: { id: "2", name: "Bia" } }, { user: { id: "1", name: "Ana" } }]);

      expect(await service.responsaveis("org-1")).toEqual([
        { id: "1", name: "Ana" },
        { id: "2", name: "Bia" },
      ]);
    });
  });
});
