import "./test-env";
import * as crypto from "crypto";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { WorkerModule } from "../src/worker/worker.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

const APP_SECRET = process.env.WHATSAPP_APP_SECRET as string;

function signPayload(payload: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac("sha256", APP_SECRET).update(Buffer.from(raw, "utf8")).digest("hex")}`;
  return { raw, signature };
}

function buildMessagePayload(opts: { phoneNumberId: string; from: string; messageId: string; text: string; timestamp: number }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-qualification-e2e",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5585900000000", phone_number_id: opts.phoneNumberId },
              contacts: [{ profile: { name: "João" }, wa_id: opts.from }],
              messages: [
                { from: opts.from, id: opts.messageId, timestamp: String(opts.timestamp), type: "text", text: { body: opts.text } },
              ],
            },
          },
        ],
      },
    ],
  };
}

function decodeJwtOrganizationId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString("utf8")) as {
    organizationId: string;
  };
  return payload.organizationId;
}

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 5000, intervalMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > deadline) throw new Error("waitFor: timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("Qualification & Sale — trigger phrases end to end (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgToken: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, WorkerModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", {
      exclude: [
        "health",
        { path: "r/:code", method: RequestMethod.GET },
        { path: "whatsapp-webhook", method: RequestMethod.GET },
        { path: "whatsapp-webhook", method: RequestMethod.POST },
      ],
    });
    await app.init();

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.deleteMany({ where: { name: { contains: "Qualification E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "qualification-e2e" } } });

    const registerResponse = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User",
      email: "user@qualification-e2e.local",
      password: "password123",
      organizationName: "Qualification E2E Org",
    });
    orgToken = registerResponse.body.accessToken;
    orgId = decodeJwtOrganizationId(orgToken);

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ phoneNumberId: "phone-qualification-e2e", displayPhoneNumber: "+55 85 90000-0000" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/classification-rules")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ targetStatus: "QUALIFIED", phrase: "vamos marcar sua consulta" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/classification-rules")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ targetStatus: "WON", phrase: "contrato fechado" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  async function sendMessage(from: string, messageId: string, text: string, timestamp: number) {
    const payload = buildMessagePayload({ phoneNumberId: "phone-qualification-e2e", from, messageId, text, timestamp });
    const { raw, signature } = signPayload(payload);
    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);
  }

  it("runs the full homologation scenario: NEW -> QUALIFIED -> WON with revenue, exactly as the spec describes (Section 100)", async () => {
    const from = "5585911111111";

    await sendMessage(from, "wamid.HOMOLOG-1", "Fui demitido e não recebi tudo", 1700000000);
    let lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );
    expect(lead.status).toBe("NEW");

    await sendMessage(from, "wamid.HOMOLOG-2", "beleza, vamos marcar sua consulta amanhã?", 1700000100);
    lead = await waitFor(async () => {
      const current = await prisma.lead.findUnique({ where: { id: lead.id } });
      return current?.status === "QUALIFIED" ? current : null;
    });
    expect(lead.qualifiedAt).not.toBeNull();

    await sendMessage(from, "wamid.HOMOLOG-3", "contrato fechado! Fechamos por 2 mil", 1700086400);
    lead = await waitFor(async () => {
      const current = await prisma.lead.findUnique({ where: { id: lead.id } });
      return current?.status === "WON" ? current : null;
    });
    expect(lead.wonAt).not.toBeNull();

    const sale = await prisma.sale.findUnique({ where: { leadId: lead.id } });
    expect(sale).toMatchObject({ amountCents: 200000, classifierType: "RULE" });

    const events = await prisma.leadEvent.findMany({ where: { leadId: lead.id }, orderBy: { occurredAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual([
      "LEAD_CREATED",
      "CONVERSATION_STARTED",
      "MESSAGE_RECEIVED",
      "MESSAGE_RECEIVED",
      "QUALIFIED",
      "MESSAGE_RECEIVED",
      "SALE_DETECTED",
      "REVENUE_DETECTED",
    ]);

    // Dashboard-relevant aggregate (Section 100/103's "+1 lead, +1 qualified, +1 sale, +R$2.000")
    const detail = await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}`)
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);
    expect(detail.body.sale.amountCents).toBe(200000);
  });

  it("resending the exact same closing message never creates a second sale (idempotency)", async () => {
    const from = "5585922222222";
    await sendMessage(from, "wamid.DUP-1", "vamos marcar sua consulta", 1700000000);
    await sendMessage(from, "wamid.DUP-2", "contrato fechado, R$ 500", 1700000100);

    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );
    await waitFor(() => prisma.sale.findUnique({ where: { leadId: lead.id } }));

    // A real Meta retry of the same webhook delivery.
    await sendMessage(from, "wamid.DUP-2", "contrato fechado, R$ 500", 1700000100);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const saleCount = await prisma.sale.count({ where: { leadId: lead.id } });
    expect(saleCount).toBe(1);
  });

  it("leaves the sale's amount null (never guesses) when the closing message carries no identifiable value", async () => {
    const from = "5585933333333";
    await sendMessage(from, "wamid.NOVAL-1", "contrato fechado, muito obrigado", 1700000000);

    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );
    const sale = await waitFor(() => prisma.sale.findUnique({ where: { leadId: lead.id } }));
    expect(sale.amountCents).toBeNull();
  });

  describe("manual correction (Section 64) with audit trail (Section 65)", () => {
    it("manually qualifies a lead that never matched a trigger, and audits the change", async () => {
      const from = "5585944444444";
      await sendMessage(from, "wamid.MANUAL-1", "oi, quero mais informações", 1700000000);
      const lead = await waitFor(() =>
        prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
      );
      expect(lead.status).toBe("NEW");

      const updated = await request(app.getHttpServer())
        .patch(`/api/leads/${lead.id}`)
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ status: "QUALIFIED" })
        .expect(200);
      expect(updated.body.status).toBe("QUALIFIED");

      const auditEntries = await prisma.auditLog.findMany({ where: { entityId: lead.id, action: "LEAD_STATUS_CHANGED" } });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]).toMatchObject({ before: { status: "NEW" }, after: { status: "QUALIFIED" } });
    });

    it("rejects an invalid (backward) status transition", async () => {
      const from = "5585955555555";
      await sendMessage(from, "wamid.INVALID-1", "vamos marcar sua consulta", 1700000000);
      const lead = await waitFor(() =>
        prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
      );
      await waitFor(async () => {
        const current = await prisma.lead.findUnique({ where: { id: lead.id } });
        return current?.status === "QUALIFIED" ? current : null;
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/leads/${lead.id}`)
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ status: "QUALIFIED" })
        .expect(400);
      expect(response.body.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("rejects setting a revenue on a lead with no sale", async () => {
      const from = "5585966666666";
      await sendMessage(from, "wamid.NOSALE-1", "oi", 1700000000);
      const lead = await waitFor(() =>
        prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/leads/${lead.id}`)
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ revenueCents: 10000 })
        .expect(400);
      expect(response.body.code).toBe("NO_SALE");
    });

    it("corrects the revenue of an existing sale and audits SALE_UPDATED", async () => {
      const from = "5585977777777";
      await sendMessage(from, "wamid.FIX-1", "contrato fechado, R$ 100", 1700000000);
      const lead = await waitFor(() =>
        prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
      );
      await waitFor(() => prisma.sale.findUnique({ where: { leadId: lead.id } }));

      const updated = await request(app.getHttpServer())
        .patch(`/api/leads/${lead.id}`)
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ revenueCents: 15000 })
        .expect(200);
      expect(updated.body.sale.amountCents).toBe(15000);

      const auditEntries = await prisma.auditLog.findMany({ where: { entityId: (await prisma.sale.findUnique({ where: { leadId: lead.id } }))!.id, action: "SALE_UPDATED" } });
      expect(auditEntries[0]).toMatchObject({ before: { amountCents: 10000 }, after: { amountCents: 15000 } });
    });
  });

  it("never lets one organization see, edit, or configure rules for another organization's data", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User B",
      email: "user-b@qualification-e2e.local",
      password: "password123",
      organizationName: "Qualification E2E Org B",
    });
    const otherToken = otherOrg.body.accessToken;

    const rulesForOtherOrg = await request(app.getHttpServer())
      .get("/api/classification-rules")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(rulesForOtherOrg.body).toHaveLength(0);

    const from = "5585988888888";
    await sendMessage(from, "wamid.ISOLATION-1", "oi", 1700000000);
    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );

    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ status: "QUALIFIED" })
      .expect(404);
  });
});
