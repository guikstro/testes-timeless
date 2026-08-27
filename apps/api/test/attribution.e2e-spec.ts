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

function buildMessagePayload(opts: {
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
  timestamp: number;
  referral?: { ctwa_clid?: string; source_id?: string; headline?: string };
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-attribution-e2e",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5585900000000", phone_number_id: opts.phoneNumberId },
              contacts: [{ profile: { name: "Lead" }, wa_id: opts.from }],
              messages: [
                {
                  from: opts.from,
                  id: opts.messageId,
                  timestamp: String(opts.timestamp),
                  type: "text",
                  text: { body: opts.text },
                  ...(opts.referral ? { referral: opts.referral } : {}),
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

describe("Attribution engine — click to lead (e2e)", () => {
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

    await prisma.organization.deleteMany({ where: { name: { contains: "Attribution E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "attribution-e2e" } } });

    const registerResponse = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User",
      email: "user@attribution-e2e.local",
      password: "password123",
      organizationName: "Attribution E2E Org",
    });
    orgToken = registerResponse.body.accessToken;
    orgId = decodeJwtOrganizationId(orgToken);

    await request(app.getHttpServer())
      .post("/api/integrations/whatsapp/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ phoneNumberId: "phone-attribution-e2e", displayPhoneNumber: "+55 85 90000-0000" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("attributes a lead to the tracking link whose wa.me redirect carried the reference token the lead's first message echoes back", async () => {
    const link = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ name: "Anúncio Rescisão Indireta", destinationUrl: "https://wa.me/5585911110000" })
      .expect(201);

    const redirect = await request(app.getHttpServer()).get(`/r/${link.body.code}`).expect(302);
    const redirectedUrl = new URL(redirect.headers.location);
    const prefilledText = redirectedUrl.searchParams.get("text") as string;
    expect(prefilledText).toMatch(/\[ref:[A-Za-z0-9]+\]/);

    const click = await prisma.trackingClick.findFirst({ where: { trackingLinkId: link.body.id } });
    expect(click?.attributionToken).toEqual(expect.any(String));

    // The customer sends WhatsApp's prefilled text back essentially as-is —
    // the realistic case this mechanism is designed for.
    const payload = buildMessagePayload({
      phoneNumberId: "phone-attribution-e2e",
      from: "5585911110000",
      messageId: "wamid.ATTR-001",
      text: prefilledText,
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
        where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: "+5585911110000" } },
      }),
    );

    const attribution = await prisma.attribution.findUnique({ where: { leadId: lead.id } });
    expect(attribution).toMatchObject({
      method: "TRACKING_LINK",
      confidence: "HIGH",
      trackingClickId: click!.id,
    });
    expect(attribution?.evidence).toMatchObject({ trackingLinkId: link.body.id });
  });

  it("never overwrites the first-touch attribution when a later message carries a different (or no) evidence", async () => {
    const linkA = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ name: "Campanha A", destinationUrl: "https://wa.me/5585922220000", defaultCampaign: "campanha-a" })
      .expect(201);
    const linkB = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ name: "Campanha B", destinationUrl: "https://wa.me/5585922220000", defaultCampaign: "campanha-b" })
      .expect(201);

    const redirectA = await request(app.getHttpServer()).get(`/r/${linkA.body.code}`).expect(302);
    const tokenA = new URL(redirectA.headers.location).searchParams.get("text") as string;

    const firstMessage = buildMessagePayload({
      phoneNumberId: "phone-attribution-e2e",
      from: "5585922220000",
      messageId: "wamid.ATTR-FIRST",
      text: tokenA,
      timestamp: 1700001000,
    });
    const signedFirst = signPayload(firstMessage);
    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signedFirst.signature)
      .send(signedFirst.raw)
      .expect(200);

    const lead = await waitFor(() =>
      prisma.lead.findUnique({
        where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: "+5585922220000" } },
      }),
    );
    await waitFor(() => prisma.attribution.findUnique({ where: { leadId: lead.id } }));

    // D+10: same lead clicks a *different* campaign's link and messages again.
    const redirectB = await request(app.getHttpServer()).get(`/r/${linkB.body.code}`).expect(302);
    const tokenB = new URL(redirectB.headers.location).searchParams.get("text") as string;

    const secondMessage = buildMessagePayload({
      phoneNumberId: "phone-attribution-e2e",
      from: "5585922220000",
      messageId: "wamid.ATTR-SECOND",
      text: tokenB,
      timestamp: 1700900000,
    });
    const signedSecond = signPayload(secondMessage);
    await request(app.getHttpServer())
      .post("/whatsapp-webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signedSecond.signature)
      .send(signedSecond.raw)
      .expect(200);

    await waitFor(() => prisma.message.findUnique({ where: { externalId: "wamid.ATTR-SECOND" } }));

    const attribution = await prisma.attribution.findUnique({ where: { leadId: lead.id } });
    expect(attribution?.evidence).toMatchObject({ utmCampaign: "campanha-a" });

    const attributionsForLead = await prisma.attribution.count({ where: { leadId: lead.id } });
    expect(attributionsForLead).toBe(1);
  });

  it("attributes a lead to a real Click-to-WhatsApp ad via Meta's own referral, with no tracking link involved at all", async () => {
    const payload = buildMessagePayload({
      phoneNumberId: "phone-attribution-e2e",
      from: "5585933330000",
      messageId: "wamid.CTWA-001",
      text: "Quero saber mais sobre o processo",
      timestamp: 1700002000,
      referral: { ctwa_clid: "ctwa.real.123", source_id: "ad-999", headline: "Rescisão Indireta - Vídeo 01" },
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
        where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: "+5585933330000" } },
      }),
    );

    const attribution = await prisma.attribution.findUnique({ where: { leadId: lead.id } });
    expect(attribution).toMatchObject({ method: "CTWA_REFERRAL", confidence: "HIGH", trackingClickId: null });
    expect(attribution?.evidence).toMatchObject({ ctwaClid: "ctwa.real.123", adId: "ad-999" });
  });

  it("attributes UNKNOWN, never a guessed campaign, when a lead's first message carries no evidence at all", async () => {
    const payload = buildMessagePayload({
      phoneNumberId: "phone-attribution-e2e",
      from: "5585944440000",
      messageId: "wamid.DIRECT-001",
      text: "Oi, vi vocês no Google",
      timestamp: 1700003000,
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
        where: { organizationId_normalizedPhone: { organizationId: orgId, normalizedPhone: "+5585944440000" } },
      }),
    );

    const attribution = await prisma.attribution.findUnique({ where: { leadId: lead.id } });
    expect(attribution).toMatchObject({ method: "UNKNOWN", confidence: "NONE", trackingClickId: null });
  });

  it("surfaces the attribution through the authenticated Leads API for the frontend Origem/Campanha columns", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/leads")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    const trackingLinkLead = list.body.items.find(
      (item: { normalizedPhone: string }) => item.normalizedPhone === "+5585911110000",
    );
    expect(trackingLinkLead.attribution).toMatchObject({ method: "TRACKING_LINK" });

    const detail = await request(app.getHttpServer())
      .get(`/api/leads/${trackingLinkLead.id}`)
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);
    expect(detail.body.attribution.trackingClick.trackingLink.name).toBe("Anúncio Rescisão Indireta");
  });
});
