import "./test-env";
import Redis from "ioredis";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Isolamento entre organizações, tentado de propósito.
 *
 * A organização A recebe um dado de cada tipo que o produto guarda, todos
 * marcados com um texto que não existe em nenhum outro lugar. Depois, com a
 * sessão da organização B, cada rota é chamada mirando os ids de A. O que se
 * espera é 403 ou 404, nunca os dados, nenhuma escrita acontecendo, e o texto
 * marcado nunca aparecendo em resposta nenhuma de B.
 *
 * Um último teste lê as rotas registradas no servidor e falha se aparecer uma
 * rota autenticada com id no caminho que não esteja nesta lista. Rota nova
 * nasce sem cobertura de isolamento só se alguém escrever, aqui, o motivo.
 */

const MARCA = "SEGREDO-DA-ORG-A-7Q2";

describe("Isolamento entre organizações (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const contaA = {
    name: `${MARCA} Ana`,
    email: "ana@isolamento-e2e.local",
    password: "senha-bem-comprida-aaa",
    organizationName: `${MARCA} Org`,
  };
  const contaB = {
    name: "Beto Isolamento",
    email: "beto@isolamento-e2e.local",
    password: "senha-bem-comprida-bbb",
    organizationName: "Org B Isolamento E2E",
  };

  let tokenB: string;
  let orgA: string;
  let orgB: string;
  let userA: string;
  let userB: string;

  /** Os ids de A que B vai tentar alcançar. */
  const a = {} as {
    lead: string;
    conversa: string;
    mensagem: string;
    venda: string;
    link: string;
    campanhaManual: string;
    campanhaMeta: string;
    campanhaExterna: string;
    conjuntoExterno: string;
    anuncioExterno: string;
    verba: string;
    regra: string;
    notificacao: string;
    sessao: string;
  };

  const doToken = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());

  async function zeraLimites() {
    const cliente = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/1");
    cliente.on("error", () => undefined);
    try {
      const chaves = await cliente.keys("throttle:*");
      if (chaves.length > 0) await cliente.del(...chaves);
    } finally {
      await cliente.quit().catch(() => undefined);
    }
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await prisma.organization.deleteMany({ where: { name: { in: [contaA.organizationName, contaB.organizationName] } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@isolamento-e2e.local" } } });
    await zeraLimites();

    const registroA = await request(app.getHttpServer()).post("/api/auth/register").send(contaA).expect(201);
    const registroB = await request(app.getHttpServer()).post("/api/auth/register").send(contaB).expect(201);
    tokenB = registroB.body.accessToken;
    ({ organizationId: orgA, sub: userA } = doToken(registroA.body.accessToken));
    ({ organizationId: orgB, sub: userB } = doToken(tokenB));
    a.sessao = doToken(registroA.body.accessToken).sid;

    // Um dado de cada tipo, direto no banco: o teste é sobre quem lê, e não
    // sobre como o dado nasce.
    const agora = new Date();
    const whatsapp = await prisma.whatsAppConnection.create({
      data: { organizationId: orgA, provider: "CLOUD_API", phoneNumberId: `${MARCA}-phone`, displayPhoneNumber: "+55 85 90000-7777" },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgA,
        name: `${MARCA} Lead`,
        normalizedPhone: "+5585911117777",
        rawPhone: "5585911117777",
        firstContactAt: agora,
        lastContactAt: agora,
      },
    });
    a.lead = lead.id;
    const conversa = await prisma.conversation.create({
      data: { organizationId: orgA, leadId: lead.id, whatsappConnectionId: whatsapp.id, startedAt: agora, lastMessageAt: agora },
    });
    a.conversa = conversa.id;
    const mensagem = await prisma.message.create({
      data: { conversationId: conversa.id, direction: "INBOUND", type: "TEXT", text: `${MARCA} mensagem`, timestamp: agora },
    });
    a.mensagem = mensagem.id;
    const venda = await prisma.sale.create({
      data: { organizationId: orgA, leadId: lead.id, amountCents: 987654, classifierType: "MANUAL", detectedAt: agora },
    });
    a.venda = venda.id;

    const link = await prisma.trackingLink.create({
      data: { organizationId: orgA, name: `${MARCA} Link`, code: "isoA7Q2", destinationUrl: "https://wa.me/5585900007777" },
    });
    a.link = link.id;
    const clique = await prisma.trackingClick.create({
      data: { organizationId: orgA, trackingLinkId: link.id, landingUrl: "https://wa.me/5585900007777", utmCampaign: MARCA },
    });
    await prisma.attribution.create({
      data: {
        organizationId: orgA,
        leadId: lead.id,
        method: "TRACKING_LINK",
        confidence: "HIGH",
        trackingClickId: clique.id,
        evidence: { utmCampaign: MARCA },
      },
    });

    const manual = await prisma.campaign.create({
      data: {
        organizationId: orgA,
        externalId: `manual:${orgA}:1`,
        name: `${MARCA} Campanha manual`,
        status: "ACTIVE",
        platform: "GOOGLE",
        manual: true,
        lastSyncedAt: agora,
      },
    });
    a.campanhaManual = manual.id;
    const meta = await prisma.campaign.create({
      data: {
        organizationId: orgA,
        externalId: "iso-camp-7q2",
        name: `${MARCA} Campanha Meta`,
        status: "ACTIVE",
        platform: "META",
        lastSyncedAt: agora,
      },
    });
    a.campanhaMeta = meta.id;
    a.campanhaExterna = meta.externalId;
    const conjunto = await prisma.adSet.create({
      data: { campaignId: meta.id, externalId: "iso-set-7q2", name: `${MARCA} Conjunto`, status: "ACTIVE", lastSyncedAt: agora },
    });
    a.conjuntoExterno = conjunto.externalId;
    const anuncio = await prisma.ad.create({
      data: { adSetId: conjunto.id, externalId: "iso-ad-7q2", name: `${MARCA} Anúncio`, status: "ACTIVE", lastSyncedAt: agora },
    });
    a.anuncioExterno = anuncio.externalId;
    const hoje = new Date(`${agora.toISOString().slice(0, 10)}T00:00:00.000Z`);
    await prisma.adSpend.create({ data: { campaignId: meta.id, date: hoje, spendCents: 777700, conversasIniciadas: 7 } });
    await prisma.adInsight.create({ data: { adId: anuncio.id, date: hoje, spendCents: 777700, impressions: 7, clicks: 7 } });

    const verba = await prisma.budget.create({
      data: { organizationId: orgA, startsOn: hoje, amountCents: 7777700, label: `${MARCA} Verba` },
    });
    a.verba = verba.id;
    const regra = await prisma.classificationRule.create({
      data: { organizationId: orgA, targetStatus: "WON", phrase: `${MARCA} fechamos` },
    });
    a.regra = regra.id;
    const notificacao = await prisma.notification.create({
      data: { organizationId: orgA, userId: userA, type: "lead.new", title: `${MARCA} Notificação` },
    });
    a.notificacao = notificacao.id;
    await prisma.metaConnection.create({
      data: { organizationId: orgA, adAccountId: `act_${MARCA}`, accessTokenEncrypted: "x:y:z", pixelId: `${MARCA}-pixel` },
    });
    await prisma.conversionEvent.create({
      data: { organizationId: orgA, leadId: lead.id, type: "LEAD", occurredAt: agora },
    });
    await prisma.mudancaNoAnuncio.create({
      data: { organizationId: orgA, userId: userA, nivel: "ANUNCIO", externalId: anuncio.externalId, nome: `${MARCA} Anúncio`, acao: "PAUSAR" },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(zeraLimites);

  const comB = (metodo: "get" | "post" | "patch" | "delete", caminho: string) =>
    request(app.getHttpServer())[metodo](`/api${caminho}`).set("Authorization", `Bearer ${tokenB}`);

  /** Toda tentativa de B sobre um recurso de A: o caminho e o corpo mandado. */
  const tentativas = (): { metodo: "get" | "post" | "patch" | "delete"; caminho: string; corpo?: object }[] => [
    { metodo: "get", caminho: `/leads/${a.lead}` },
    { metodo: "patch", caminho: `/leads/${a.lead}`, corpo: { status: "QUALIFIED" } },
    { metodo: "post", caminho: `/leads/${a.lead}/messages`, corpo: { text: "invasão" } },
    { metodo: "get", caminho: `/tracking-links/${a.link}` },
    { metodo: "patch", caminho: `/tracking-links/${a.link}`, corpo: { name: "invadido" } },
    { metodo: "delete", caminho: `/tracking-links/${a.link}` },
    { metodo: "patch", caminho: `/verbas/${a.verba}`, corpo: { de: "2026-01-01", valorCentavos: 1 } },
    { metodo: "delete", caminho: `/verbas/${a.verba}` },
    { metodo: "post", caminho: `/campaigns/${a.campanhaManual}/spend`, corpo: { date: "2026-01-01", spendCents: 1 } },
    { metodo: "post", caminho: `/campaigns/${a.campanhaMeta}/csv`, corpo: { conteudo: "data,valor\n2026-01-01,1", colunaData: 0, colunaValor: 1 } },
    { metodo: "delete", caminho: `/campaigns/${a.campanhaManual}` },
    { metodo: "delete", caminho: `/classification-rules/${a.regra}` },
    { metodo: "patch", caminho: `/notifications/${a.notificacao}/read` },
    { metodo: "delete", caminho: `/auth/sessoes/${a.sessao}` },
    { metodo: "patch", caminho: `/organizations/current/members/${userA}`, corpo: { role: "MEMBER" } },
    { metodo: "delete", caminho: `/organizations/current/members/${userA}` },
    { metodo: "post", caminho: `/controle-de-anuncios/campanhas/${a.campanhaExterna}/pausar` },
    { metodo: "post", caminho: `/controle-de-anuncios/campanhas/${a.campanhaExterna}/ativar` },
    { metodo: "post", caminho: `/controle-de-anuncios/conjuntos/${a.conjuntoExterno}/pausar` },
    { metodo: "post", caminho: `/controle-de-anuncios/conjuntos/${a.conjuntoExterno}/ativar` },
    { metodo: "post", caminho: `/controle-de-anuncios/anuncios/${a.anuncioExterno}/pausar` },
    { metodo: "post", caminho: `/controle-de-anuncios/anuncios/${a.anuncioExterno}/ativar` },
    { metodo: "patch", caminho: `/controle-de-anuncios/conjuntos/${a.conjuntoExterno}/orcamento`, corpo: { valorCentavos: 100 } },
  ];

  it("nega toda tentativa de B sobre um recurso de A, com 403 ou 404 e sem os dados", async () => {
    for (const t of tentativas()) {
      const chamada = comB(t.metodo, t.caminho);
      const resposta = await (t.corpo ? chamada.send(t.corpo) : chamada);

      // `${método} ${caminho} -> ${status}` na mensagem, para a falha dizer qual rota vazou.
      expect(`${t.metodo.toUpperCase()} ${t.caminho} -> ${[403, 404].includes(resposta.status) ? "negado" : resposta.status}`).toBe(
        `${t.metodo.toUpperCase()} ${t.caminho} -> negado`,
      );
      expect(JSON.stringify(resposta.body)).not.toContain(MARCA);
    }
  });

  it("nenhuma das tentativas escreveu nada em A", async () => {
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: a.lead } });
    expect(lead.status).toBe("NEW");
    expect(await prisma.message.count({ where: { conversationId: a.conversa } })).toBe(1);
    expect((await prisma.trackingLink.findUniqueOrThrow({ where: { id: a.link } })).deletedAt).toBeNull();
    expect((await prisma.trackingLink.findUniqueOrThrow({ where: { id: a.link } })).name).toBe(`${MARCA} Link`);
    expect(await prisma.budget.findUnique({ where: { id: a.verba } })).not.toBeNull();
    expect(await prisma.campaign.findUnique({ where: { id: a.campanhaManual } })).not.toBeNull();
    expect(await prisma.adSpend.count({ where: { campaignId: a.campanhaManual } })).toBe(0);
    expect(await prisma.classificationRule.findUnique({ where: { id: a.regra } })).not.toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: a.notificacao } })).read).toBe(false);
    expect((await prisma.sessao.findUniqueOrThrow({ where: { id: a.sessao } })).encerradaEm).toBeNull();
    const vinculo = await prisma.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgA, userId: userA } },
    });
    expect(vinculo.role).toBe("OWNER");
    expect(await prisma.mudancaNoAnuncio.count({ where: { organizationId: orgB } })).toBe(0);
  });

  it("nenhuma listagem de B traz qualquer dado de A", async () => {
    const leituras = [
      "/leads",
      `/leads?search=${encodeURIComponent(MARCA)}`,
      "/conversations",
      "/tracking-links",
      "/verbas",
      "/verbas/resumo",
      "/campaigns",
      "/campaigns?platform=META",
      "/campaigns/investimento?days=30",
      "/analytics/overview?days=30",
      "/analytics/campanhas",
      "/analytics/anuncios",
      "/notifications",
      "/classification-rules",
      "/integrations/meta",
      "/integrations/meta/saude",
      "/integrations/meta/conversion-events",
      "/integrations/whatsapp",
      "/integrations/whatsapp/regra",
      "/integrations/google/conversions?de=2020-01-01&ate=2030-12-31",
      "/controle-de-anuncios/historico",
      "/auditoria",
      `/auditoria?pessoa=${userA}`,
      "/auditoria/pessoas",
      "/organizations/current",
      "/organizations/current/members",
      "/organizations/current/support-accesses",
      "/auth/session",
      "/auth/sessoes",
    ];

    for (const caminho of leituras) {
      const resposta = await comB("get", caminho);
      const corpo = JSON.stringify(resposta.body);
      expect(`${caminho}: ${corpo.includes(MARCA) ? "vazou" : "ok"}`).toBe(`${caminho}: ok`);
      for (const id of [a.lead, a.link, a.verba, a.regra, a.notificacao, a.campanhaMeta, orgA]) {
        expect(`${caminho}: ${corpo.includes(id) ? `trouxe o id ${id}` : "ok"}`).toBe(`${caminho}: ok`);
      }
    }
  });

  it("não deixa B entrar na organização de A pedindo o id dela no login", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: contaB.email, password: contaB.password, organizationId: orgA })
      .expect(403);
    expect(resposta.body.accessToken).toBeUndefined();
  });

  /*
    A pessoa pode pertencer a mais de uma organização, ou ter saído de uma.
    As notificações que recebeu lá não aparecem na sessão de outra.
  */
  it("a caixa de notificações é a da organização da sessão", async () => {
    await prisma.notification.create({
      data: { organizationId: orgA, userId: userB, type: "lead.new", title: `${MARCA} de quando Beto era de A` },
    });

    const resposta = await comB("get", "/notifications").expect(200);
    expect(JSON.stringify(resposta.body)).not.toContain(MARCA);
  });

  /*
    A cobertura, garantida pela lista de rotas do próprio servidor.

    Toda rota autenticada com um id no caminho precisa estar entre as
    tentativas acima, ou aqui, com o motivo de não estar.
  */
  it("toda rota autenticada com id no caminho está coberta ou tem o motivo escrito", () => {
    const FORA_DO_TESTE: Record<string, string> = {
      // Só operadores da plataforma, com segundo fator; o isolamento entre
      // clientes não se aplica a quem administra todos eles.
      "POST /api/admin/organizations/:id/impersonate": "rota da administração da plataforma",
      "POST /api/admin/organizations/:id/entrada": "rota da administração da plataforma",
      "DELETE /api/admin/operators/:id": "rota da administração da plataforma",
    };

    const instancia = app.getHttpAdapter().getInstance();
    const pilha: { route?: { path: string; methods: Record<string, boolean> } }[] =
      (instancia.router ?? instancia._router).stack;

    const cobertas = new Set(
      tentativas().map((t) => {
        // Troca cada id pelo nome do parâmetro, para comparar com a rota.
        let caminho = `/api${t.caminho}`;
        for (const [nome, valor] of Object.entries({ ...a, userA })) {
          caminho = caminho.replace(String(valor), `:${nome}`);
        }
        return `${t.metodo.toUpperCase()} ${caminho}`;
      }),
    );
    const normaliza = (rota: string) => rota.replace(/:[A-Za-z]+/g, ":p");
    const cobertasNormalizadas = new Set([...cobertas].map(normaliza));

    const semCobertura = pilha
      .filter((camada) => camada.route && camada.route.path.includes(":"))
      .flatMap((camada) =>
        Object.keys(camada.route!.methods).map((metodo) => `${metodo.toUpperCase()} ${camada.route!.path}`),
      )
      // Rotas públicas por natureza: redirecionamento de link, imagem com
      // nome aleatório de 128 bits, e webhook autenticado por segredo.
      .filter((rota) => !/^GET (\/api)?\/r\/|^GET (\/api)?\/uploads\/|whatsapp-webhook/.test(rota))
      .filter((rota) => !(rota in FORA_DO_TESTE))
      .filter((rota) => !cobertasNormalizadas.has(normaliza(rota)));

    expect(semCobertura).toEqual([]);
  });
});
