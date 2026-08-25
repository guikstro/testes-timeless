import "./test-env";
import * as crypto from "crypto";
import * as http from "http";
import { AddressInfo } from "net";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { WorkerModule } from "../src/worker/worker.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

const APP_SECRET = process.env.WHATSAPP_APP_SECRET as string;

interface CapturedEvent {
  pixelId: string;
  accessToken: string;
  body: { event_name: string; event_id: string; event_time: number; user_data: { ph: string[]; ctwa_clid?: string }; custom_data?: { value: number; currency: string } };
}

/**
 * Same rationale as meta-ads.e2e-spec.ts: no real Meta credentials in this
 * environment, so this double mimics both the Ads Graph API (so
 * `connect()`'s immediate sync succeeds without noise) and the Conversions
 * API's `/{pixel_id}/events` endpoint, capturing every event this product
 * actually sends so tests can assert on it precisely.
 */
function startMockMetaServer(): Promise<{ server: http.Server; baseUrl: string; receivedEvents: CapturedEvent[] }> {
  const receivedEvents: CapturedEvent[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      res.setHeader("Content-Type", "application/json");

      if (url.pathname.startsWith("/act_") && !url.pathname.endsWith("/events")) {
        // Ads reporting endpoints (campaigns/adsets/ads/insights) — empty is enough, Fase 7 doesn't touch these.
        res.end(JSON.stringify({ data: [] }));
        return;
      }

      if (url.pathname === "/pixel_invalid/events") {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: "Invalid OAuth access token — Cannot parse access token", code: 190 } }));
        return;
      }

      if (url.pathname.endsWith("/events")) {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          const parsed = JSON.parse(raw) as { data: CapturedEvent["body"][]; access_token: string };
          const pixelId = url.pathname.split("/")[1];
          receivedEvents.push({ pixelId, accessToken: parsed.access_token, body: parsed.data[0] });
          res.end(JSON.stringify({ events_received: 1, fbtrace_id: `trace-${receivedEvents.length}` }));
        });
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: "not found in mock server" } }));
    });

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://localhost:${port}`, receivedEvents });
    });
  });
}

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
        id: "waba-meta-capi-e2e",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5585900000001", phone_number_id: opts.phoneNumberId },
              contacts: [{ profile: { name: "Maria" }, wa_id: opts.from }],
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

describe("Meta Conversions API — Lead/QualifiedLead/Purchase end to end (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgToken: string;
  let orgId: string;
  let mockServer: http.Server;
  let receivedEvents: CapturedEvent[];

  beforeAll(async () => {
    const mock = await startMockMetaServer();
    mockServer = mock.server;
    receivedEvents = mock.receivedEvents;
    process.env.META_GRAPH_API_BASE_URL = mock.baseUrl;

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

    await prisma.organization.deleteMany({ where: { name: { contains: "Meta CAPI E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "meta-capi-e2e" } } });

    const registerResponse = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User",
      email: "user@meta-capi-e2e.local",
      password: "password123",
      organizationName: "Meta CAPI E2E Org",
    });
    orgToken = registerResponse.body.accessToken;
    orgId = decodeJwtOrganizationId(orgToken);

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ phoneNumberId: "phone-meta-capi-e2e", displayPhoneNumber: "+55 85 90000-0001" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/integrations/meta/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ adAccountId: "act_123", accessToken: "ads-token" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/integrations/meta/capi/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ pixelId: "pixel_valid", capiAccessToken: "capi-token" })
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
    await new Promise((resolve) => mockServer.close(resolve));
  });

  async function sendMessage(from: string, messageId: string, text: string, timestamp: number) {
    const payload = buildMessagePayload({ phoneNumberId: "phone-meta-capi-e2e", from, messageId, text, timestamp });
    const { raw, signature } = signPayload(payload);
    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);
  }

  function eventsFor(leadId: string) {
    return receivedEvents.filter((e) => e.body.event_id.startsWith(`${leadId}:`));
  }

  it("sends a real Lead event to the Conversions API the moment a WhatsApp lead is created, with the phone hashed", async () => {
    const from = "5585911111111";
    await sendMessage(from, "wamid.CAPI-1", "oi, quero mais informações", 1700000000);

    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );

    const conversionEvent = await waitFor(async () => {
      const current = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "LEAD" } } });
      return current?.status === "SENT" ? current : null;
    });
    expect(conversionEvent.sentAt).not.toBeNull();

    const sent = eventsFor(lead.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].pixelId).toBe("pixel_valid");
    expect(sent[0].accessToken).toBe("capi-token");
    expect(sent[0].body.event_name).toBe("Lead");
    expect(sent[0].body.user_data.ph).toEqual([crypto.createHash("sha256").update(from).digest("hex")]);
    expect(sent[0].body.user_data.ph[0]).not.toContain(from);
  });

  it("sends a custom QualifiedLead event when the qualification trigger matches", async () => {
    const from = "5585922222222";
    await sendMessage(from, "wamid.CAPI-2", "oi", 1700000000);
    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );
    await waitFor(async () => {
      const current = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "LEAD" } } });
      return current?.status === "SENT" ? current : null;
    });

    await sendMessage(from, "wamid.CAPI-3", "beleza, vamos marcar sua consulta amanhã?", 1700000100);

    await waitFor(async () => {
      const current = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "QUALIFIED_LEAD" } } });
      return current?.status === "SENT" ? current : null;
    });
    const sent = eventsFor(lead.id).find((e) => e.body.event_name === "QualifiedLead");
    expect(sent).toBeDefined();
  });

  it("sends a Purchase event with the value converted from cents to the main currency unit", async () => {
    const from = "5585933333333";
    await sendMessage(from, "wamid.CAPI-4", "contrato fechado! Fechamos por 2 mil", 1700000000);
    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );

    const conversionEvent = await waitFor(async () => {
      const current = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "PURCHASE" } } });
      return current?.status === "SENT" ? current : null;
    });
    expect(conversionEvent.valueCents).toBe(200000);

    const sent = eventsFor(lead.id).find((e) => e.body.event_name === "Purchase");
    expect(sent?.body.custom_data).toEqual({ value: 2000, currency: "BRL" });
  });

  it("never sends an incomplete Purchase — waits for the value to be known via manual correction, then sends it", async () => {
    const from = "5585944444444";
    await sendMessage(from, "wamid.CAPI-5", "contrato fechado, muito obrigado!", 1700000000);
    const lead = await waitFor(() =>
      prisma.lead.findUnique({ where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: `+${from}` } } }),
    );
    await waitFor(() => prisma.sale.findUnique({ where: { leadId: lead.id } }));

    await new Promise((resolve) => setTimeout(resolve, 400));
    let conversionEvent = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "PURCHASE" } } });
    expect(conversionEvent).toBeNull();
    expect(eventsFor(lead.id).find((e) => e.body.event_name === "Purchase")).toBeUndefined();

    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ revenueCents: 30000 })
      .expect(200);

    conversionEvent = await waitFor(async () => {
      const current = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "PURCHASE" } } });
      return current?.status === "SENT" ? current : null;
    });
    expect(conversionEvent!.valueCents).toBe(30000);
  });

  it("keeps retrying (never SENT) when the configured CAPI token is rejected by Meta, and records the real error", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User Invalid Pixel",
      email: "invalid-pixel@meta-capi-e2e.local",
      password: "password123",
      organizationName: "Meta CAPI E2E Org Invalid Pixel",
    });
    const otherToken = otherOrg.body.accessToken;
    const otherOrgId = decodeJwtOrganizationId(otherToken);

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ phoneNumberId: "phone-meta-capi-e2e-invalid", displayPhoneNumber: "+55 85 90000-0002" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/integrations/meta/connect")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ adAccountId: "act_456", accessToken: "ads-token" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/integrations/meta/capi/connect")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ pixelId: "pixel_invalid", capiAccessToken: "bad-token" })
      .expect(201);

    const payload = buildMessagePayload({
      phoneNumberId: "phone-meta-capi-e2e-invalid",
      from: "5585955555555",
      messageId: "wamid.CAPI-6",
      text: "oi",
      timestamp: 1700000000,
    });
    const { raw, signature } = signPayload(payload);
    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);

    const lead = await waitFor(() =>
      prisma.lead.findUnique({
        where: { organizationId_normalizedPhone: { organizationId: otherOrgId, normalizedPhone: "+5585955555555" } },
      }),
    );
    const conversionEvent = await waitFor(async () => {
      const current = await prisma.conversionEvent.findUnique({ where: { leadId_type: { leadId: lead.id, type: "LEAD" } } });
      return current && current.status !== "PENDING" ? current : null;
    });
    expect(conversionEvent.status).toBe("RETRYING");
    expect(conversionEvent.lastError).toContain("access token");
  });

  it("requires an existing Meta Ads connection before Conversions API can be configured", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User No Ads",
      email: "no-ads@meta-capi-e2e.local",
      password: "password123",
      organizationName: "Meta CAPI E2E Org No Ads",
    });
    const otherToken = otherOrg.body.accessToken;

    const response = await request(app.getHttpServer())
      .post("/api/integrations/meta/capi/connect")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ pixelId: "pixel_x", capiAccessToken: "token_x" })
      .expect(400);
    expect(response.body.code).toBe("NOT_CONNECTED");
  });

  it("never records a conversion event for an organization that never connected Meta at all", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User No Meta",
      email: "no-meta@meta-capi-e2e.local",
      password: "password123",
      organizationName: "Meta CAPI E2E Org No Meta",
    });
    const otherToken = otherOrg.body.accessToken;
    const otherOrgId = decodeJwtOrganizationId(otherToken);

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ phoneNumberId: "phone-meta-capi-e2e-none", displayPhoneNumber: "+55 85 90000-0003" })
      .expect(201);

    const payload = buildMessagePayload({
      phoneNumberId: "phone-meta-capi-e2e-none",
      from: "5585966666666",
      messageId: "wamid.CAPI-7",
      text: "oi",
      timestamp: 1700000000,
    });
    const { raw, signature } = signPayload(payload);
    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
      .expect(200);

    const lead = await waitFor(() =>
      prisma.lead.findUnique({
        where: { organizationId_normalizedPhone: { organizationId: otherOrgId, normalizedPhone: "+5585966666666" } },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    const count = await prisma.conversionEvent.count({ where: { leadId: lead.id } });
    expect(count).toBe(0);
  });

  it("never lets one organization see another organization's conversion events", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User Isolation",
      email: "isolation@meta-capi-e2e.local",
      password: "password123",
      organizationName: "Meta CAPI E2E Org Isolation",
    });
    const otherToken = otherOrg.body.accessToken;

    const response = await request(app.getHttpServer())
      .get("/api/integrations/meta/conversion-events")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);

    const ownEvents = await request(app.getHttpServer())
      .get("/api/integrations/meta/conversion-events")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);
    expect(ownEvents.body.total).toBeGreaterThan(0);
  });
});
