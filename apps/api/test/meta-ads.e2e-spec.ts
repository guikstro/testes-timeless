import "./test-env";
import * as http from "http";
import { AddressInfo } from "net";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { WorkerModule } from "../src/worker/worker.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * There are no real Meta credentials in this environment (documented in
 * docs/META_ADS.md). This spins up a tiny local HTTP server that mimics the
 * documented Graph API response shapes — pagination via `paging.next`,
 * Meta's `{error: {code, message}}` error envelope — so the *real*
 * MetaGraphClient/MetaSyncService code paths run over real HTTP, against a
 * faithful double, rather than mocking the service methods themselves.
 */
function startMockMetaServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      res.setHeader("Content-Type", "application/json");

      if (url.pathname === "/act_expired/campaigns" || url.pathname.startsWith("/act_expired/")) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: "Error validating access token", code: 190, error_subcode: 463 } }));
        return;
      }

      if (url.pathname.startsWith("/act_ratelimited/")) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: { message: "User request limit reached", code: 17 } }));
        return;
      }

      if (url.pathname === "/act_123/campaigns") {
        if (url.searchParams.get("after") === "page2") {
          res.end(JSON.stringify({ data: [{ id: "c2", name: "Campanha Instagram", status: "ACTIVE" }] }));
          return;
        }
        res.end(
          JSON.stringify({
            data: [{ id: "c1", name: "Direito Trabalhista", status: "ACTIVE" }],
            paging: { next: `http://localhost:${(server.address() as AddressInfo).port}/act_123/campaigns?after=page2` },
          }),
        );
        return;
      }

      if (url.pathname === "/act_123/adsets") {
        res.end(
          JSON.stringify({
            data: [{ id: "as1", name: "Fortaleza 25-55", status: "ACTIVE", campaign_id: "c1" }],
          }),
        );
        return;
      }

      if (url.pathname === "/act_123/ads") {
        res.end(
          JSON.stringify({
            data: [{ id: "ad1", name: "Rescisão Indireta - Vídeo 01", status: "ACTIVE", adset_id: "as1" }],
          }),
        );
        return;
      }

      if (url.pathname === "/act_123/insights") {
        res.end(
          JSON.stringify({
            data: [
              { campaign_id: "c1", spend: "750.00", date_start: "2026-08-20" },
              { campaign_id: "c2", spend: "250.50", date_start: "2026-08-20" },
            ],
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: "not found in mock server" } }));
    });

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
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

describe("Meta Ads sync (e2e, against a local Graph API double)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgToken: string;
  let orgId: string;
  let mockServer: http.Server;

  beforeAll(async () => {
    const { server, baseUrl } = await startMockMetaServer();
    mockServer = server;
    process.env.META_GRAPH_API_BASE_URL = baseUrl;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, WorkerModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health"] });
    await app.init();

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.deleteMany({ where: { name: { contains: "Meta Ads E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "meta-ads-e2e" } } });

    const registerResponse = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User",
      email: "user@meta-ads-e2e.local",
      password: "password123",
      organizationName: "Meta Ads E2E Org",
    });
    orgToken = registerResponse.body.accessToken;
    orgId = decodeJwtOrganizationId(orgToken);
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => mockServer.close(resolve));
  });

  it("connecting triggers an immediate sync that populates the full campaign -> ad set -> ad hierarchy and spend, via real pagination", async () => {
    await request(app.getHttpServer())
      .post("/api/integrations/meta/connect")
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ adAccountId: "act_123", accessToken: "valid-token-123" })
      .expect(201);

    // Two campaigns only appear once real pagination (paging.next) was followed.
    const campaigns = await waitFor(async () => {
      const rows = await prisma.campaign.findMany({ where: { organizationId: orgId } });
      return rows.length === 2 ? rows : null;
    });
    expect(campaigns.map((c) => c.name).sort()).toEqual(["Campanha Instagram", "Direito Trabalhista"]);

    const campaign1 = campaigns.find((c) => c.externalId === "c1")!;
    // Pelo par, e não só pelo id externo: ele passou a ser único dentro da
    // campanha, porque global ele era um espaço compartilhado entre clientes.
    const adSet = await waitFor(() =>
      prisma.adSet.findUnique({ where: { campaignId_externalId: { campaignId: campaign1.id, externalId: "as1" } } }),
    );
    expect(adSet.campaignId).toBe(campaign1.id);
    expect(adSet.name).toBe("Fortaleza 25-55");

    const ad = await waitFor(() =>
      prisma.ad.findUnique({ where: { adSetId_externalId: { adSetId: adSet.id, externalId: "ad1" } } }),
    );
    expect(ad.adSetId).toBe(adSet.id);
    expect(ad.name).toBe("Rescisão Indireta - Vídeo 01");

    const spend = await waitFor(() =>
      prisma.adSpend.findUnique({ where: { campaignId_date: { campaignId: campaign1.id, date: new Date("2026-08-20") } } }),
    );
    expect(spend.spendCents).toBe(75000);

    const connection = await request(app.getHttpServer())
      .get("/api/integrations/meta")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);
    expect(connection.body.status).toBe("CONNECTED");
    expect(connection.body.lastSyncedAt).not.toBeNull();
    expect(connection.body).not.toHaveProperty("accessTokenEncrypted");
  });

  it("exposes the synced hierarchy with aggregated spend through the authenticated Campaigns API", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    const campaign = response.body.find((c: { externalId: string }) => c.externalId === "c1");
    expect(campaign.totalSpendCents).toBe(75000);
    expect(campaign.adSets[0].ads[0].name).toBe("Rescisão Indireta - Vídeo 01");
  });

  it("a manual re-sync (POST /sync) refreshes lastSyncedAt without duplicating any row", async () => {
    const before = await prisma.campaign.count({ where: { organizationId: orgId } });

    await request(app.getHttpServer())
      .post("/api/integrations/meta/sync")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(204);

    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await prisma.campaign.count({ where: { organizationId: orgId } });
    expect(after).toBe(before);
  });

  it("marks the connection TOKEN_EXPIRED when Meta rejects the access token (error code 190)", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User Expired",
      email: "expired@meta-ads-e2e.local",
      password: "password123",
      organizationName: "Meta Ads E2E Org Expired",
    });
    const expiredOrgToken = otherOrg.body.accessToken;
    const expiredOrgId = decodeJwtOrganizationId(expiredOrgToken);

    await request(app.getHttpServer())
      .post("/api/integrations/meta/connect")
      .set("Authorization", `Bearer ${expiredOrgToken}`)
      .send({ adAccountId: "act_expired", accessToken: "any-token" })
      .expect(201);

    await waitFor(async () => {
      const connection = await prisma.metaConnection.findUnique({ where: { organizationId: expiredOrgId } });
      return connection?.status === "TOKEN_EXPIRED" ? connection : null;
    });

    const response = await request(app.getHttpServer())
      .get("/api/integrations/meta")
      .set("Authorization", `Bearer ${expiredOrgToken}`)
      .expect(200);
    expect(response.body.status).toBe("TOKEN_EXPIRED");
    expect(response.body.lastSyncError).toContain("access token");
  });

  it("never lets one organization see another organization's Meta connection or campaigns", async () => {
    const otherOrg = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User C",
      email: "user-c@meta-ads-e2e.local",
      password: "password123",
      organizationName: "Meta Ads E2E Org C",
    });
    const otherToken = otherOrg.body.accessToken;

    const connection = await request(app.getHttpServer())
      .get("/api/integrations/meta")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(connection.body).toBeNull();

    const campaigns = await request(app.getHttpServer())
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(campaigns.body).toEqual([]);
  });
});
