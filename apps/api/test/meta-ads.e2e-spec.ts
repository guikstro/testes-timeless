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
/** O que o dublê recebeu em cada escrita, para os testes conferirem o corpo. */
const escritasRecebidas: Array<{ id: string; corpo: Record<string, string> }> = [];

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
        /*
          Linhas no nível do anúncio, como a Meta devolve com `level=ad`.

          A campanha c1 vem quebrada em dois anúncios: é o caso que prova que
          o total dela é somado, e não sobrescrito pela última linha do laço.
          A última linha carrega um anúncio que não existe na conta, para o
          gasto dele contar no total mesmo sem ter detalhe próprio.
        */
        res.end(
          JSON.stringify({
            data: [
              { campaign_id: "c1", adset_id: "as1", ad_id: "ad1", spend: "500.00", impressions: "9000", clicks: "310", date_start: "2026-08-20" },
              { campaign_id: "c1", adset_id: "as1", ad_id: "ad-apagado", spend: "250.00", date_start: "2026-08-20" },
              { campaign_id: "c2", spend: "250.50", date_start: "2026-08-20" },
            ],
          }),
        );
        return;
      }

      /*
        Escrita: `POST /{id}`, que é como a Graph API altera status e
        orçamento nos três níveis.

        `ad-sem-permissao` devolve o código 200 da Meta, que é o documentado
        para "requires extended permission". É o caso mais comum de falha
        real aqui, e precisa chegar até a tela com esse nome.
      */
      if (req.method === "POST" && /^\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
        let corpo = "";
        req.on("data", (pedaco) => (corpo += pedaco));
        req.on("end", () => {
          if (url.pathname === "/ad-sem-permissao") {
            res.statusCode = 403;
            res.end(
              JSON.stringify({
                error: { message: "(#200) Requires extended permission: ads_management", code: 200 },
              }),
            );
            return;
          }
          escritasRecebidas.push({ id: url.pathname.slice(1), corpo: JSON.parse(corpo || "{}") });
          res.end(JSON.stringify({ success: true }));
        });
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
    // Quinhentos do anúncio conhecido mais duzentos e cinquenta do apagado: o
    // total da campanha soma as linhas, e inclui gasto de anúncio que já não
    // existe na conta. Somar só o reconhecido encolheria o total em silêncio.
    expect(spend.spendCents).toBe(75000);

    const desempenho = await waitFor(() =>
      prisma.adInsight.findUnique({ where: { adId_date: { adId: ad.id, date: new Date("2026-08-20") } } }),
    );
    expect(desempenho.spendCents).toBe(50000);
    expect(desempenho.impressions).toBe(9000);
    expect(desempenho.clicks).toBe(310);

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

  /*
    O lead de Click-to-WhatsApp precisa aparecer no desempenho por campanha.

    A Meta manda só o id do anúncio no referral da mensagem, nunca a campanha.
    Enquanto o relatório lia o id da campanha direto da evidência, todo lead
    vindo do caminho de evidência mais forte deste produto entrava com campanha
    nula e sumia daqui, embora a ficha do próprio lead mostrasse o nome da
    campanha, porque lá a hierarquia já era resolvida pelo anúncio.

    Este teste vive no nível de banco de propósito: o que se prova é a subida
    anúncio -> conjunto -> campanha usando as linhas sincronizadas, e um teste
    de unidade com mapa na mão não provaria isso.
  */
  it("conta o lead de clique para o WhatsApp na campanha do anúncio, que a Meta não manda", async () => {
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        normalizedPhone: "5585911112222",
        rawPhone: "+55 85 91111-2222",
        firstContactAt: new Date("2026-08-20T13:00:00.000Z"),
        lastContactAt: new Date("2026-08-20T13:00:00.000Z"),
      },
    });

    await prisma.attribution.create({
      data: {
        organizationId: orgId,
        leadId: lead.id,
        method: "CTWA_REFERRAL",
        confidence: "HIGH",
        // Sem clique e sem campanha: é exatamente o que a Meta entrega.
        evidence: { ctwaClid: "clid-abc", adId: "ad1" },
      },
    });

    const porCampanha = await request(app.getHttpServer())
      .get("/api/analytics/campanhas?de=2026-08-01&ate=2026-08-31")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    const campanha = porCampanha.body.campanhas.find((c: { externalId: string }) => c.externalId === "c1");
    expect(campanha.atual.leads).toBe(1);
    // E não cai no balde de "nenhuma campanha reivindica este lead", que é
    // onde ele estava indo parar.
    expect(porCampanha.body.semCampanha.atual).toBe(0);

    // E continua aparecendo no nível do anúncio, que é onde a decisão acontece.
    const porAnuncio = await request(app.getHttpServer())
      .get("/api/analytics/anuncios?de=2026-08-01&ate=2026-08-31")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    expect(porAnuncio.body.anuncios.find((a: { externalId: string }) => a.externalId === "ad1").leads).toBe(1);
    expect(porAnuncio.body.semAnuncio).toBe(0);

    // E a tela sabe dizer que este lead está coberto pela tabela.
    expect(porAnuncio.body.identificacao).toMatchObject({
      total: 1,
      atePeloAnuncio: 1,
      semOrigem: 0,
      coberturaPorCento: 100,
    });
    expect(porAnuncio.body.identificacao.porMetodo.CTWA_REFERRAL).toBe(1);
  });

  it("monta o extrato com um dia por dia do período, sem inventar zero no futuro", async () => {
    const resposta = await request(app.getHttpServer())
      .get("/api/analytics/anuncios?de=2026-08-01&ate=2026-08-31")
      .set("Authorization", `Bearer ${orgToken}`)
      .expect(200);

    expect(resposta.body.porDia).toHaveLength(31);

    const comGasto = resposta.body.porDia.find((d: { dia: string }) => d.dia === "2026-08-20");
    expect(comGasto.gastoCentavos).toBe(50000);

    // Agosto já passou inteiro, então nenhum dia dele está sem medida.
    expect(resposta.body.porDia.every((d: { gastoCentavos: number | null }) => d.gastoCentavos !== null)).toBe(true);
  });

  /*
    Controle de escrita.

    Aqui a chamada sai de verdade pela rede até o dublê, então o que se prova
    não é que um mock foi chamado: é o contrato inteiro, do papel de quem
    clicou ao corpo que chega na Graph API.
  */
  describe("escrever na conta de anúncios", () => {
    beforeEach(() => {
      escritasRecebidas.length = 0;
    });

    it("pausa o anúncio, manda o status para a Meta e guarda quem fez", async () => {
      const resposta = await request(app.getHttpServer())
        .post("/api/controle-de-anuncios/anuncios/ad1/pausar")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(201);

      expect(resposta.body).toMatchObject({ alterado: true, status: "PAUSED" });
      expect(escritasRecebidas).toEqual([{ id: "ad1", corpo: expect.objectContaining({ status: "PAUSED" }) }]);

      // A cópia local muda junto, senão a tela volta mostrando o estado antigo.
      const ad = await prisma.ad.findFirst({ where: { externalId: "ad1", adSet: { campaign: { organizationId: orgId } } } });
      expect(ad!.status).toBe("PAUSED");

      const historico = await request(app.getHttpServer())
        .get("/api/controle-de-anuncios/historico")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(200);
      expect(historico.body[0]).toMatchObject({
        externalId: "ad1",
        nome: "Rescisão Indireta - Vídeo 01",
        acao: "PAUSAR",
        de: "ACTIVE",
        para: "PAUSED",
        erro: null,
      });
      expect(historico.body[0].aplicadoEm).not.toBeNull();
    });

    it("pausar o que já está pausado não escreve nada e não polui o histórico", async () => {
      /*
        Anúncio próprio, e não `ad1`.

        `ad1` está na listagem do dublê como ACTIVE, e a sincronia disparada
        pela escrita anterior o devolve para ACTIVE a qualquer momento. O que
        se prova aqui é a regra de "já está no estado pedido", não o resultado
        de uma corrida com a fila.
      */
      const adSet = await prisma.adSet.findFirst({ where: { externalId: "as1", campaign: { organizationId: orgId } } });
      await prisma.ad.create({
        data: { adSetId: adSet!.id, externalId: "ad-ja-pausado", name: "Já pausado", status: "PAUSED", lastSyncedAt: new Date() },
      });

      const antes = (
        await request(app.getHttpServer())
          .get("/api/controle-de-anuncios/historico")
          .set("Authorization", `Bearer ${orgToken}`)
      ).body.length;

      const resposta = await request(app.getHttpServer())
        .post("/api/controle-de-anuncios/anuncios/ad-ja-pausado/pausar")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(201);

      expect(resposta.body.alterado).toBe(false);
      expect(escritasRecebidas).toHaveLength(0);

      const depois = (
        await request(app.getHttpServer())
          .get("/api/controle-de-anuncios/historico")
          .set("Authorization", `Bearer ${orgToken}`)
      ).body.length;
      expect(depois).toBe(antes);
    });

    it("reativa o anúncio", async () => {
      // Anúncio próprio pelo mesmo motivo do teste acima: `ad1` volta a ACTIVE
      // sozinho quando a sincronia disparada pela escrita anterior roda.
      const adSet = await prisma.adSet.findFirst({ where: { externalId: "as1", campaign: { organizationId: orgId } } });
      await prisma.ad.create({
        data: { adSetId: adSet!.id, externalId: "ad-para-ativar", name: "Para ativar", status: "PAUSED", lastSyncedAt: new Date() },
      });

      await request(app.getHttpServer())
        .post("/api/controle-de-anuncios/anuncios/ad-para-ativar/ativar")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(201);

      expect(escritasRecebidas).toEqual([
        { id: "ad-para-ativar", corpo: expect.objectContaining({ status: "ACTIVE" }) },
      ]);
    });

    it("manda o orçamento diário em centavos", async () => {
      // O erro mais caro que este caminho poderia cometer é mandar reais.
      await request(app.getHttpServer())
        .patch("/api/controle-de-anuncios/conjuntos/as1/orcamento")
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ valorCentavos: 30_000 })
        .expect(200);

      expect(escritasRecebidas).toEqual([{ id: "as1", corpo: expect.objectContaining({ daily_budget: "30000" }) }]);
    });

    it("recusa o orçamento que estoura a verba combinada, sem chamar a Meta", async () => {
      await request(app.getHttpServer())
        .post("/api/verbas")
        .set("Authorization", `Bearer ${orgToken}`)
        /*
          Com fim declarado de propósito.

          Verba sem fim vale até acabar, e por isso nenhum diário a estoura
          "antes do prazo": ali o veredicto é aviso, não bloqueio. O bloqueio
          existe quando há um prazo para não cumprir.
        */
        .send({ de: hojeCivil(), ate: daquiATresDias(), valorCentavos: 10_000, rotulo: "Curta" })
        .expect(201);

      const recusa = await request(app.getHttpServer())
        .patch("/api/controle-de-anuncios/conjuntos/as1/orcamento")
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ valorCentavos: 900_000 })
        .expect(400);

      expect(recusa.body.code).toBe("ORCAMENTO_ESTOURA_VERBA");
      expect(escritasRecebidas).toHaveLength(0);

      // E passa quando o estouro é confirmado de propósito.
      await request(app.getHttpServer())
        .patch("/api/controle-de-anuncios/conjuntos/as1/orcamento")
        .set("Authorization", `Bearer ${orgToken}`)
        .send({ valorCentavos: 900_000, confirmarEstouro: true })
        .expect(200);
      expect(escritasRecebidas).toHaveLength(1);
    });

    it("diz que falta ads_management, em vez de só dizer que falhou", async () => {
      // O anúncio precisa existir do nosso lado para a chamada chegar na Meta.
      const adSet = await prisma.adSet.findFirst({ where: { externalId: "as1", campaign: { organizationId: orgId } } });
      await prisma.ad.create({
        data: { adSetId: adSet!.id, externalId: "ad-sem-permissao", name: "Sem permissão", status: "ACTIVE", lastSyncedAt: new Date() },
      });

      const resposta = await request(app.getHttpServer())
        .post("/api/controle-de-anuncios/anuncios/ad-sem-permissao/pausar")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(403);

      expect(resposta.body.code).toBe("SEM_ADS_MANAGEMENT");

      // E a tentativa falha fica registrada, com o motivo.
      const historico = await request(app.getHttpServer())
        .get("/api/controle-de-anuncios/historico")
        .set("Authorization", `Bearer ${orgToken}`)
        .expect(200);
      const linha = historico.body.find((l: { externalId: string }) => l.externalId === "ad-sem-permissao");
      expect(linha.aplicadoEm).toBeNull();
      expect(linha.erro).toContain("ads_management");
    });

    it("não deixa uma organização pausar o anúncio de outra", async () => {
      const outra = await request(app.getHttpServer()).post("/api/auth/register").send({
        name: "User D",
        email: "user-d@meta-ads-e2e.local",
        password: "password123",
        organizationName: "Meta Ads E2E Org D",
      });

      // Mesma resposta de "não existe": distinguir revelaria que o id é de alguém.
      const resposta = await request(app.getHttpServer())
        .post("/api/controle-de-anuncios/anuncios/ad1/pausar")
        .set("Authorization", `Bearer ${outra.body.accessToken}`)
        .expect(404);

      expect(resposta.body.code).toBe("NAO_ENCONTRADO");
      expect(escritasRecebidas).toHaveLength(0);
    });
  });
});

/** Hoje em Brasília, como dia civil, que é o fuso em que a verba é contada. */
function hojeCivil(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Três dias à frente, em dia civil de Brasília. */
function daquiATresDias(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
