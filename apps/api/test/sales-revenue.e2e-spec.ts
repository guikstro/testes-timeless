import "./test-env";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AuditoriaService } from "../src/auditoria/auditoria.service";
import { SalesService } from "../src/sales/sales.service";
import { SalesSourcesService } from "../src/sales/sales-sources.service";
import {
  SalesEventsController,
  SalesIntegrationGuard,
} from "../src/sales/sales.controller";
import { ConversionEventsService } from "../src/integrations/meta/conversion-events.service";

describe("Revenue intelligence: database and HTTP boundaries", () => {
  const prisma = new PrismaService();
  const queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn() };
  const conversions = new ConversionEventsService(prisma, queue as never);
  const sales = new SalesService(
    prisma,
    new AuditoriaService(prisma),
    conversions,
  );
  const sources = new SalesSourcesService(
    prisma,
    new AuditoriaService(prisma),
    sales,
  );
  let app: INestApplication;
  let organizationId: string;
  let otherOrg: string;
  let actorId: string;
  let leadId: string;
  let source: Awaited<ReturnType<typeof sources.create>>;
  const author = () => ({ organizationId, userId: actorId });
  const event = () => ({
    externalId: randomUUID(),
    eventId: randomUUID(),
    phone: "5585999999999",
    status: "WON" as const,
    valueCents: 85000,
    currency: "BRL",
    occurredAt: "2026-10-07T14:30:00Z",
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SalesEventsController],
      providers: [
        SalesIntegrationGuard,
        { provide: SalesSourcesService, useValue: sources },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await prisma.$connect();
    const org = await prisma.organization.create({
      data: { name: "Revenue test", slug: `revenue-${randomUUID()}` },
    });
    organizationId = org.id;
    otherOrg = (
      await prisma.organization.create({
        data: { name: "Other", slug: randomUUID() },
      })
    ).id;
    actorId = (
      await prisma.user.create({
        data: {
          name: "Reviewer",
          email: `${randomUUID()}@test.local`,
          passwordHash: "not-used",
        },
      })
    ).id;
    await prisma.membership.create({
      data: { organizationId, userId: actorId, role: "OWNER" },
    });
    leadId = (
      await prisma.lead.create({
        data: {
          organizationId,
          normalizedPhone: "+5585999999999",
          rawPhone: "5585999999999",
          firstContactAt: new Date(),
          lastContactAt: new Date(),
        },
      })
    ).id;
    source = await sources.create(author(), { name: "CRM", type: "CRM" });
  });
  afterAll(async () => {
    await app?.close();
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, otherOrg].filter(Boolean) } },
    });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it("keeps credentials hashed and never returns hashes or tokens on listing", async () => {
    const stored = await prisma.salesSource.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(stored.credentialHash).not.toBe(source.token);
    const list = await sources.list(organizationId);
    expect(list[0]).not.toHaveProperty("credentialHash");
    expect(list[0]).not.toHaveProperty("token");
  });
  it("rejects unauthenticated input, floats and caller-supplied organization IDs", async () => {
    await request(app.getHttpServer())
      .post("/integrations/sales/events")
      .send(event())
      .expect(401);
    await request(app.getHttpServer())
      .post("/integrations/sales/events")
      .set("Authorization", `Bearer ${source.token}`)
      .send({ ...event(), valueCents: 1.2 })
      .expect(400);
    await request(app.getHttpServer())
      .post("/integrations/sales/events")
      .set("Authorization", `Bearer ${source.token}`)
      .send({ ...event(), organizationId: otherOrg })
      .expect(400);
  });
  it("serializes duplicate deliveries, confirms once and resolves the existing lead", async () => {
    const dto = event();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post("/integrations/sales/events")
          .set("Authorization", `Bearer ${source.token}`)
          .send(dto)
          .expect(201),
      ),
    );
    const saleId = responses[0].body.saleId;
    expect(new Set(responses.map((r) => r.body.saleId)).size).toBe(1);
    const sale = await sales.detail(organizationId, saleId);
    expect(sale).toMatchObject({
      status: "CONFIRMED",
      amountCents: 85000,
      leadId,
    });
    expect(sale.evidence).toHaveLength(1);
    await request(app.getHttpServer())
      .post("/integrations/sales/events")
      .set("Authorization", `Bearer ${source.token}`)
      .send({ ...dto, valueCents: 90000 })
      .expect(409);
  });
  it("records conflict, requires an explicit review, keeps reviewer identity and reopens for new evidence", async () => {
    const crm = await sources.authenticate(`Bearer ${source.token}`);
    const initial = await sources.event(crm, {
      ...event(),
      valueCents: 150000,
    });
    const payment = await sources.create(author(), {
      name: "Payment",
      type: "PAYMENT",
    });
    const paymentSource = await sources.authenticate(`Bearer ${payment.token}`);
    const paymentEvent = {
      ...event(),
      saleId: initial.saleId,
      valueCents: 120000,
    };
    await sources.event(paymentSource, paymentEvent);
    const conflicted = await sales.detail(organizationId, initial.saleId);
    expect(conflicted).toMatchObject({
      amountCents: 120000,
      confirmationSource: "PAYMENT",
      needsReview: true,
    });
    const review = {
      requestId: randomUUID(),
      action: "RESOLVE" as const,
      selectedEvidenceId: conflicted.evidence.find(
        (e) => e.source === "PAYMENT",
      )!.id,
      notes: "Conferido com comprovante",
    };
    await sales.review(author(), initial.saleId, review);
    await sales.review(author(), initial.saleId, review);
    const resolved = await sales.detail(organizationId, initial.saleId);
    expect(resolved.needsReview).toBe(false);
    expect(resolved.evidence).toHaveLength(3);
    expect(resolved.evidence[2].actorName).toBe("Reviewer");
    // No saleId on later delivery: the external mapping retains the association.
    await sources.event(paymentSource, {
      ...paymentEvent,
      saleId: undefined,
      eventId: randomUUID(),
      status: "REFUNDED",
      occurredAt: "2026-10-08T14:30:00Z",
    });
    expect((await sales.detail(organizationId, initial.saleId)).status).toBe(
      "CANCELLED",
    );
  });
  it("isolates sale IDs, lead IDs and unit credentials across tenants", async () => {
    const created = await sales.manual(author(), {
      requestId: randomUUID(),
      leadId,
      valueCents: 100,
      currency: "BRL",
      occurredAt: new Date().toISOString(),
    });
    await expect(sales.detail(otherOrg, created.id)).rejects.toThrow(
      "Venda não encontrada",
    );
    await expect(
      sales.manual(
        { organizationId: otherOrg, userId: actorId },
        {
          requestId: randomUUID(),
          leadId,
          valueCents: 100,
          currency: "BRL",
          occurredAt: new Date().toISOString(),
        },
      ),
    ).rejects.toThrow("Lead não encontrado");
    await sources.createUnit(author(), { name: "A", code: "a" });
    await sources.createUnit(author(), { name: "B", code: "b" });
    const restricted = await sources.create(author(), {
      name: "A",
      type: "API",
      unitCode: "a",
    });
    await request(app.getHttpServer())
      .post("/integrations/sales/events")
      .set("Authorization", `Bearer ${restricted.token}`)
      .send({ ...event(), unitCode: "b" })
      .expect(400);
  });
  it("does not silently merge contradictory identities", async () => {
    await prisma.lead.create({
      data: {
        organizationId,
        normalizedPhone: "+5585988888888",
        rawPhone: "5585988888888",
        email: "another@example.com",
        firstContactAt: new Date(),
        lastContactAt: new Date(),
      },
    });
    const result = await sales.manual(author(), {
      requestId: randomUUID(),
      phone: "5585999999999",
      email: "another@example.com",
      valueCents: 100,
      currency: "BRL",
      occurredAt: new Date().toISOString(),
    });
    expect(result).toMatchObject({ leadId: null, needsReview: true });
  });
  it("supports repeat purchases by the same lead and excludes refunded/conflicting amounts", async () => {
    const a = await sales.manual(author(), {
      requestId: randomUUID(),
      leadId,
      valueCents: 100,
      currency: "USD",
      occurredAt: new Date().toISOString(),
    });
    const b = await sales.manual(author(), {
      requestId: randomUUID(),
      leadId,
      valueCents: 200,
      currency: "USD",
      occurredAt: new Date().toISOString(),
    });
    expect(a.id).not.toBe(b.id);
    await sales.review(author(), b.id, {
      requestId: randomUUID(),
      action: "CANCEL",
    });
    const metrics = await sales.analytics(organizationId, {});
    expect(metrics.currencies.find((c) => c.currency === "USD")).toMatchObject({
      confirmedSales: 1,
      revenueCents: 100,
    });
  });
  it("rolls back evidence and the sale if the audit cannot be committed", async () => {
    const audit = new AuditoriaService(prisma);
    jest
      .spyOn(audit, "registra")
      .mockRejectedValueOnce(new Error("audit unavailable"));
    const service = new SalesService(prisma, audit, conversions);
    const requestId = randomUUID();
    const count = await prisma.sale.count({ where: { organizationId } });
    await expect(
      service.manual(author(), {
        requestId,
        leadId,
        valueCents: 100,
        currency: "BRL",
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("audit unavailable");
    expect(await prisma.sale.count({ where: { organizationId } })).toBe(count);
    expect(
      await prisma.saleEvidence.count({
        where: { organizationId, eventKey: `manual:${requestId}` },
      }),
    ).toBe(0);
  });
  it("preserves attribution through correction and links ambiguous identities explicitly", async () => {
    await prisma.attribution.create({
      data: {
        organizationId,
        leadId,
        method: "CTWA_REFERRAL",
        confidence: "HIGH",
        evidence: { campaignId: "original" },
      },
    });
    const result = await sales.manual(author(), {
      requestId: randomUUID(),
      phone: "5585999999999",
      email: "another@example.com",
      valueCents: 100,
      currency: "BRL",
      occurredAt: new Date().toISOString(),
    });
    expect(
      (await sales.detail(organizationId, result.id)).identityCandidates,
    ).toHaveLength(2);
    await sales.review(author(), result.id, {
      requestId: randomUUID(),
      action: "LINK",
      leadId,
    });
    const linked = await sales.detail(organizationId, result.id);
    expect(linked).toMatchObject({
      leadId,
      needsReview: false,
      attributionSnapshot: { evidence: { campaignId: "original" } },
    });
    await prisma.attribution.update({
      where: { leadId },
      data: { evidence: { campaignId: "changed" } },
    });
    await sales.review(author(), result.id, {
      requestId: randomUUID(),
      action: "CONFIRM",
      valueCents: 200,
    });
    expect(
      (await sales.detail(organizationId, result.id)).attributionSnapshot,
    ).toEqual(linked.attributionSnapshot);
  });
  it("stages a purchase transactionally, corrects unsent value and preserves sent facts", async () => {
    await prisma.metaConnection.create({
      data: {
        organizationId,
        adAccountId: "local-test",
        accessTokenEncrypted: "unused",
      },
    });
    const futureSaleDate = new Date(Date.now() + 86400000);
    const sale = await sales.manual(author(), {
      requestId: randomUUID(),
      leadId,
      valueCents: 100,
      currency: "BRL",
      occurredAt: futureSaleDate.toISOString(),
    });
    const purchase = await prisma.conversionEvent.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    expect(purchase).toMatchObject({
      status: "PENDING",
      valueCents: 100,
      deduplicationKey: `sale:${sale.id}:PURCHASE`,
    });
    await sales.review(author(), sale.id, {
      requestId: randomUUID(),
      action: "CONFIRM",
      valueCents: 200,
    });
    expect(
      await prisma.conversionEvent.findUnique({ where: { id: purchase.id } }),
    ).toMatchObject({
      valueCents: 200,
      status: "PENDING",
      occurredAt: futureSaleDate,
    });
    expect(
      await prisma.sale.findUnique({ where: { id: sale.id } }),
    ).toMatchObject({ amountCents: 200, occurredAt: futureSaleDate });
    await prisma.conversionEvent.update({
      where: { id: purchase.id },
      data: { status: "SENT" },
    });
    await sales.review(author(), sale.id, {
      requestId: randomUUID(),
      action: "CONFIRM",
      valueCents: 300,
    });
    expect(
      await prisma.conversionEvent.findMany({ where: { saleId: sale.id } }),
    ).toEqual([
      expect.objectContaining({
        id: purchase.id,
        status: "SENT",
        valueCents: 200,
      }),
    ]);
  });
  it("revocation and rotation invalidate the previous credential", async () => {
    const key = await sources.create(author(), {
      name: "rotation",
      type: "API",
    });
    const rotated = await sources.credential(author(), key.id, false);
    await expect(sources.authenticate(`Bearer ${key.token}`)).rejects.toThrow();
    await expect(
      sources.authenticate(`Bearer ${rotated.token}`),
    ).resolves.toMatchObject({ id: key.id });
    await sources.credential(author(), key.id, true);
    await expect(
      sources.authenticate(`Bearer ${rotated.token}`),
    ).rejects.toThrow();
  });
});
