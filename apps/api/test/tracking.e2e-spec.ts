import "./test-env";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

describe("Tracking links and clicks (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAToken: string;
  let orgBToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", {
      exclude: ["health", { path: "r/:code", method: RequestMethod.GET }],
    });
    await app.init();

    prisma = moduleRef.get(PrismaService);

    await prisma.trackingClick.deleteMany({ where: { trackingLink: { organization: { name: { contains: "Tracking E2E" } } } } });
    await prisma.trackingLink.deleteMany({ where: { organization: { name: { contains: "Tracking E2E" } } } });
    await prisma.membership.deleteMany({ where: { organization: { name: { contains: "Tracking E2E" } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "tracking-e2e" } } });
    await prisma.organization.deleteMany({ where: { name: { contains: "Tracking E2E" } } });

    const orgA = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User A",
      email: "user-a@tracking-e2e.local",
      password: "password123",
      organizationName: "Tracking E2E Org A",
    });
    orgAToken = orgA.body.accessToken;

    const orgB = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User B",
      email: "user-b@tracking-e2e.local",
      password: "password123",
      organizationName: "Tracking E2E Org B",
    });
    orgBToken = orgB.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a tracking link scoped to the caller's organization", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .send({ name: "Instagram Bio", destinationUrl: "https://wa.me/5585999999999" })
      .expect(201);

    expect(response.body.code).toEqual(expect.any(String));
    expect(response.body.organizationId).toEqual(expect.any(String));
  });

  it("rejects creating a link without authentication", async () => {
    await request(app.getHttpServer())
      .post("/api/tracking-links")
      .send({ name: "No auth", destinationUrl: "https://example.com" })
      .expect(401);
  });

  it("redirects a click to the link's destination and persists the UTMs/media ids as evidence", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .send({ name: "Anúncio Rescisão Indireta", destinationUrl: "https://wa.me/5585988887777" })
      .expect(201);

    const code = created.body.code as string;

    const redirect = await request(app.getHttpServer())
      .get(`/r/${code}`)
      .query({
        utm_source: "facebook_ads",
        utm_medium: "cpc",
        utm_campaign: "direito-trabalhista",
        fbclid: "fb.test.123",
        campaign_id: "camp-1",
        adset_id: "adset-1",
        ad_id: "ad-1",
      })
      .set("Referer", "https://facebook.com")
      .expect(302);

    expect(redirect.headers.location).toBe("https://wa.me/5585988887777");

    const click = await prisma.trackingClick.findFirst({
      where: { trackingLinkId: created.body.id },
      orderBy: { clickedAt: "desc" },
    });

    expect(click).toMatchObject({
      utmSource: "facebook_ads",
      utmMedium: "cpc",
      utmCampaign: "direito-trabalhista",
      fbclid: "fb.test.123",
      campaignId: "camp-1",
      adsetId: "adset-1",
      adId: "ad-1",
      landingUrl: "https://wa.me/5585988887777",
    });
  });

  it("falls back to the link's default source/medium/campaign when the click carries none", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .send({
        name: "Bio do Instagram",
        destinationUrl: "https://wa.me/5585977776666",
        defaultSource: "instagram",
        defaultMedium: "bio-link",
        defaultCampaign: "always-on",
      })
      .expect(201);

    await request(app.getHttpServer()).get(`/r/${created.body.code}`).expect(302);

    const click = await prisma.trackingClick.findFirst({
      where: { trackingLinkId: created.body.id },
      orderBy: { clickedAt: "desc" },
    });

    expect(click).toMatchObject({ utmSource: "instagram", utmMedium: "bio-link", utmCampaign: "always-on" });
  });

  it("returns 404 for an unknown tracking code without ever leaking that as a 500", async () => {
    await request(app.getHttpServer()).get("/r/does-not-exist").expect(404);
  });

  it("reflects click counts on the list and detail endpoints", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .send({ name: "Contador de cliques", destinationUrl: "https://wa.me/5585966665555" })
      .expect(201);

    await request(app.getHttpServer()).get(`/r/${created.body.code}`).expect(302);
    await request(app.getHttpServer()).get(`/r/${created.body.code}`).expect(302);

    const detail = await request(app.getHttpServer())
      .get(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgAToken}`)
      .expect(200);

    expect(detail.body._count.clicks).toBe(2);

    const list = await request(app.getHttpServer())
      .get("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .expect(200);

    const listed = list.body.items.find((item: { id: string }) => item.id === created.body.id);
    expect(listed._count.clicks).toBe(2);
  });

  it("never lets one organization see or delete another organization's tracking link", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .send({ name: "Só da Org A", destinationUrl: "https://wa.me/5585955554444" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgBToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgBToken}`)
      .send({ name: "Sequestrado" })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgBToken}`)
      .expect(404);

    // Untouched: still visible and unchanged to its real owner.
    const stillThere = await request(app.getHttpServer())
      .get(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgAToken}`)
      .expect(200);
    expect(stillThere.body.name).toBe("Só da Org A");
  });

  it("soft-deletes a link: it disappears from listings but click history and the redirect are gone too", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/tracking-links")
      .set("Authorization", `Bearer ${orgAToken}`)
      .send({ name: "Vai ser removido", destinationUrl: "https://wa.me/5585944443333" })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgAToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/tracking-links/${created.body.id}`)
      .set("Authorization", `Bearer ${orgAToken}`)
      .expect(404);

    await request(app.getHttpServer()).get(`/r/${created.body.code}`).expect(404);
  });
});
