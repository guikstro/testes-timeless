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

/**
 * Returns the JSON as a string, not a Buffer: supertest/superagent
 * JSON.stringify()s a Buffer passed to `.send()` (producing
 * `{"type":"Buffer","data":[...]}`), silently corrupting the bytes that get
 * transmitted — signing a Buffer and sending that same Buffer through
 * supertest verifies against bytes the server never actually receives. A
 * string body is sent verbatim.
 */
function signPayload(payload: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac("sha256", APP_SECRET).update(Buffer.from(raw, "utf8")).digest("hex")}`;
  return { raw, signature };
}

function buildMessagePayload(opts: {
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
  timestamp: number;
  profileName?: string;
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-e2e",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5585900000000", phone_number_id: opts.phoneNumberId },
              contacts: [{ profile: { name: opts.profileName ?? "João" }, wa_id: opts.from }],
              messages: [
                {
                  from: opts.from,
                  id: opts.messageId,
                  timestamp: String(opts.timestamp),
                  type: "text",
                  text: { body: opts.text },
                },
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

// 15s (não 5s): o worker roda no mesmo processo e concorre com as outras
// suítes; sob carga, 5s estourava de forma intermitente. Como a função
// retorna assim que a condição é satisfeita, um teto maior não deixa
// nenhum teste que passa mais lento — só evita a falha falsa.
async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 15000, intervalMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > deadline) throw new Error("waitFor: timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("WhatsApp webhook → queue → worker → lead (e2e)", () => {
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

    // Organization rows cascade to memberships/leads/conversations/messages/
    // events/connections (see the schema's onDelete: Cascade), so deleting
    // the orgs is enough to give this suite a clean slate.
    await prisma.organization.deleteMany({ where: { name: { contains: "WhatsApp E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "whatsapp-e2e" } } });

    const registerResponse = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User WA",
      email: "user@whatsapp-e2e.local",
      password: "password123",
      organizationName: "WhatsApp E2E Org",
    });
    orgToken = registerResponse.body.accessToken;
    orgId = decodeJwtOrganizationId(orgToken);

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ phoneNumberId: "phone-e2e-1", displayPhoneNumber: "+55 85 90000-0000" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("a single inbound message creates exactly one lead, one conversation, and one message, with a full timeline", async () => {
    const payload = buildMessagePayload({
      phoneNumberId: "phone-e2e-1",
      from: "5585999999999",
      messageId: "wamid.E2E-001",
      text: "Fui demitido e não recebi tudo",
      timestamp: 1700000000,
    });
    const { raw, signature } = signPayload(payload);

    const webhookResponse = await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);

    // Guards against a silent signature-verification failure masquerading as
    // "the worker didn't run yet".
    expect(webhookResponse.body).toEqual({ received: true });

    const message = await waitFor(() => prisma.message.findUnique({ where: { externalId: "wamid.E2E-001" } }));
    expect(message.type).toBe("TEXT");
    expect(message.text).toBe("Fui demitido e não recebi tudo");

    const lead = await prisma.lead.findUnique({
      where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: "+5585999999999" } },
    });
    expect(lead).not.toBeNull();
    expect(lead?.name).toBe("João");

    const conversations = await prisma.conversation.findMany({ where: { leadId: lead!.id } });
    expect(conversations).toHaveLength(1);

    const events = await prisma.leadEvent.findMany({ where: { leadId: lead!.id }, orderBy: { occurredAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["LEAD_CREATED", "CONVERSATION_STARTED", "MESSAGE_RECEIVED"]);
  });

  it("a duplicated webhook delivery of the same message never creates a second lead, conversation, or message", async () => {
    const payload = buildMessagePayload({
      phoneNumberId: "phone-e2e-1",
      from: "5585999999999",
      messageId: "wamid.E2E-001", // same id as the previous test — a real Meta retry
      text: "Fui demitido e não recebi tudo",
      timestamp: 1700000000,
    });
    const { raw, signature } = signPayload(payload);

    const before = await prisma.message.count();

    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);

    // Give the worker a moment in case it were to (incorrectly) process this
    // as new; then assert the count genuinely never changed.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await prisma.message.count();
    expect(after).toBe(before);

    const lead = await prisma.lead.findUnique({
      where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: "+5585999999999" } },
    });
    const conversations = await prisma.conversation.findMany({ where: { leadId: lead!.id } });
    expect(conversations).toHaveLength(1);
  });

  it("a second, different message from the same phone reuses the same lead and conversation", async () => {
    const payload = buildMessagePayload({
      phoneNumberId: "phone-e2e-1",
      from: "5585999999999",
      messageId: "wamid.E2E-002",
      text: "vamos marcar sua consulta",
      timestamp: 1700000500,
    });
    const { raw, signature } = signPayload(payload);

    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);

    await waitFor(() => prisma.message.findUnique({ where: { externalId: "wamid.E2E-002" } }));

    const leads = await prisma.lead.findMany({
      where: { organizationId: orgId, normalizedPhone: "+5585999999999" },
    });
    expect(leads).toHaveLength(1);

    const conversations = await prisma.conversation.findMany({ where: { leadId: leads[0].id } });
    expect(conversations).toHaveLength(1);

    const events = await prisma.leadEvent.findMany({ where: { leadId: leads[0].id } });
    expect(events.filter((e) => e.type === "LEAD_CREATED")).toHaveLength(1);
    expect(events.filter((e) => e.type === "CONVERSATION_STARTED")).toHaveLength(1);
    expect(events.filter((e) => e.type === "MESSAGE_RECEIVED")).toHaveLength(2);
  });

  it("rejects a webhook payload with an invalid/missing signature without processing it", async () => {
    const payload = buildMessagePayload({
      phoneNumberId: "phone-e2e-1",
      from: "5585977776666",
      messageId: "wamid.SHOULD-NOT-EXIST",
      text: "não deveria processar",
      timestamp: 1700001000,
    });

    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", "sha256=deadbeef")
      .send(payload)
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const message = await prisma.message.findUnique({ where: { externalId: "wamid.SHOULD-NOT-EXIST" } });
    expect(message).toBeNull();
  });

  it("confirms Meta's webhook handshake (GET) only for the correct verify token", async () => {
    await request(app.getHttpServer())
      .get("/whatsapp-webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, "hub.challenge": "12345" })
      .expect(200)
      .expect("12345");

    await request(app.getHttpServer())
      .get("/whatsapp-webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "12345" })
      .expect(403);
  });

  it("exposes the created lead through the authenticated Leads API, scoped to the connecting organization", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/leads")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const lead = list.body.items.find((item: { normalizedPhone: string }) => item.normalizedPhone === "+5585999999999");
    expect(lead).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}`)
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    expect(detail.body.messages.length).toBe(2);
    expect(detail.body.events.length).toBe(4);
  });

  it("never lets a second organization claim an already-connected phone_number_id, or see the first organization's leads", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User WA B",
      email: "user-b@whatsapp-e2e.local",
      password: "password123",
      organizationName: "WhatsApp E2E Org B",
    });
    const otherToken = otherOrg.body.accessToken;

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ phoneNumberId: "phone-e2e-1", displayPhoneNumber: "+55 85 90000-0000" })
      .expect(409);

    const otherLeadsList = await request(app.getHttpServer())
      .get("/api/leads")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(otherLeadsList.body.items).toHaveLength(0);
  });
});
