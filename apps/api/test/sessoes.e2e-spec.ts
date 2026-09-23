import "./test-env";
import Redis from "ioredis";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Sessões, contra o banco de verdade.
 *
 * O que só este arquivo prova, e os testes de unidade não alcançam: que
 * encerrar uma sessão derruba o token de acesso dela na requisição seguinte,
 * e não quinze minutos depois. É a propriedade que faz o botão servir para
 * alguma coisa no único cenário em que alguém o aperta: sessão roubada.
 */
describe("Sessões (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const pessoa = {
    name: "Ana Sessões",
    email: "ana@sessoes-e2e.local",
    password: "senha-bem-comprida-123",
    organizationName: "Org Sessões E2E",
  };

  const NOTEBOOK = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
  const TELEFONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

  async function entra(userAgent: string) {
    const resposta = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("X-Client-User-Agent", userAgent)
      .send({ email: pessoa.email, password: pessoa.password })
      .expect(200);
    return resposta.body as { accessToken: string; refreshToken: string };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.organization.deleteMany({ where: { name: { in: [pessoa.organizationName, "Org Outra Sessões"] } } });
    await prisma.user.deleteMany({ where: { email: { in: [pessoa.email, "outra@sessoes-e2e.local"] } } });

    await request(app.getHttpServer()).post("/api/auth/register").send(pessoa).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  /*
    Zera a cota de login antes de cada teste.

    Este arquivo entra muitas vezes com a mesma conta, porque cada teste
    precisa de sessões novas, e o limite de autenticação (dez em cinco
    minutos) disparava lá pelo sétimo. O limite em si continua sendo
    exercitado a cada chamada; o que se zera é só a contagem acumulada entre
    testes independentes. Mesmo raciocínio de `setup-e2e-file.ts`, um nível
    abaixo.
  */
  beforeEach(async () => {
    const cliente = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/1");
    cliente.on("error", () => undefined);
    try {
      const chaves = await cliente.keys("throttle:*");
      if (chaves.length > 0) await cliente.del(...chaves);
    } finally {
      await cliente.quit().catch(() => undefined);
    }
  });

  it("lista as sessões com o aparelho legível e marca a atual", async () => {
    const notebook = await entra(NOTEBOOK);
    await entra(TELEFONE);

    const resposta = await request(app.getHttpServer())
      .get("/api/auth/sessoes")
      .set("Authorization", `Bearer ${notebook.accessToken}`)
      .expect(200);

    const aparelhos = resposta.body.map((s: { aparelho: string }) => s.aparelho);
    expect(aparelhos).toContain("Chrome no macOS");
    expect(aparelhos).toContain("Safari no iPhone");

    const atual = resposta.body.filter((s: { atual: boolean }) => s.atual);
    expect(atual).toHaveLength(1);
    expect(atual[0].aparelho).toBe("Chrome no macOS");
  });

  /*
    A propriedade que justifica a tela. Sem a conferência da sessão em toda
    requisição, o token de acesso do aparelho encerrado seguiria valendo até
    vencer, e quem roubou ficaria dentro depois de a vítima apertar o botão.
  */
  it("encerrar derruba o token de acesso da outra sessão na hora", async () => {
    const eu = await entra(NOTEBOOK);
    const roubada = await entra(TELEFONE);

    // A sessão roubada funciona antes.
    await request(app.getHttpServer())
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${roubada.accessToken}`)
      .expect(200);

    const lista = await request(app.getHttpServer())
      .get("/api/auth/sessoes")
      .set("Authorization", `Bearer ${eu.accessToken}`)
      .expect(200);
    const idDaRoubada = lista.body.find((s: { aparelho: string; atual: boolean }) => s.aparelho === "Safari no iPhone" && !s.atual).id;

    await request(app.getHttpServer())
      .delete(`/api/auth/sessoes/${idDaRoubada}`)
      .set("Authorization", `Bearer ${eu.accessToken}`)
      .expect(204);

    // E não funciona mais, embora o token ainda esteja dentro da validade.
    const depois = await request(app.getHttpServer())
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${roubada.accessToken}`)
      .expect(401);
    expect(depois.body.code).toBe("SESSAO_ENCERRADA");

    // Nem consegue renovar.
    await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken: roubada.refreshToken }).expect(401);

    // E a minha continua de pé.
    await request(app.getHttpServer()).get("/api/auth/session").set("Authorization", `Bearer ${eu.accessToken}`).expect(200);
  });

  it("não deixa encerrar a própria sessão por aqui", async () => {
    // Deixaria a tela sem sessão no meio da ação. O caminho é "sair".
    const eu = await entra(NOTEBOOK);
    const lista = await request(app.getHttpServer()).get("/api/auth/sessoes").set("Authorization", `Bearer ${eu.accessToken}`);
    const minha = lista.body.find((s: { atual: boolean }) => s.atual).id;

    const resposta = await request(app.getHttpServer())
      .delete(`/api/auth/sessoes/${minha}`)
      .set("Authorization", `Bearer ${eu.accessToken}`)
      .expect(400);
    expect(resposta.body.code).toBe("SESSAO_ATUAL");
  });

  it("encerra todas as outras e mantém esta", async () => {
    const eu = await entra(NOTEBOOK);
    const outra1 = await entra(TELEFONE);
    const outra2 = await entra(TELEFONE);

    await request(app.getHttpServer()).delete("/api/auth/sessoes").set("Authorization", `Bearer ${eu.accessToken}`).expect(200);

    for (const outra of [outra1, outra2]) {
      await request(app.getHttpServer()).get("/api/auth/session").set("Authorization", `Bearer ${outra.accessToken}`).expect(401);
    }
    await request(app.getHttpServer()).get("/api/auth/session").set("Authorization", `Bearer ${eu.accessToken}`).expect(200);

    const lista = await request(app.getHttpServer()).get("/api/auth/sessoes").set("Authorization", `Bearer ${eu.accessToken}`);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].atual).toBe(true);
  });

  /*
    Isolamento entre pessoas. Encerrar a sessão de outra pessoa não é uma
    permissão que exista nesta tela, e a garantia é o filtro dentro da
    consulta, não uma conferência depois.
  */
  it("não deixa encerrar a sessão de outra pessoa", async () => {
    const eu = await entra(NOTEBOOK);

    const outra = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "Outra",
      email: "outra@sessoes-e2e.local",
      password: "senha-bem-comprida-123",
      organizationName: "Org Outra Sessões",
    });
    const listaDela = await request(app.getHttpServer())
      .get("/api/auth/sessoes")
      .set("Authorization", `Bearer ${outra.body.accessToken}`);
    const idDela = listaDela.body[0].id;

    // Responde igual a id inexistente: distinguir revelaria que ele existe.
    const resposta = await request(app.getHttpServer())
      .delete(`/api/auth/sessoes/${idDela}`)
      .set("Authorization", `Bearer ${eu.accessToken}`)
      .expect(404);
    expect(resposta.body.code).toBe("NAO_ENCONTRADA");

    // E a sessão dela continua funcionando.
    await request(app.getHttpServer())
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${outra.body.accessToken}`)
      .expect(200);
  });

  describe("renovação", () => {
    it("continua a mesma sessão, em vez de abrir outra a cada quinze minutos", async () => {
      const eu = await entra(NOTEBOOK);
      const antes = await prisma.sessao.count({ where: { user: { email: pessoa.email } } });

      const renovada = await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .send({ refreshToken: eu.refreshToken })
        .expect(200);

      expect(await prisma.sessao.count({ where: { user: { email: pessoa.email } } })).toBe(antes);

      const sid = (t: string) => JSON.parse(Buffer.from(t.split(".")[1], "base64").toString()).sid;
      expect(sid(renovada.body.accessToken)).toBe(sid(eu.accessToken));
    });

    /*
      Depois de rotacionado, o navegador sobrescreve o cookie e nunca mais
      manda o token antigo. Se ele reaparece depois da carência, alguém tem uma
      cópia, e a sessão inteira cai — inclusive o token novo, que pode estar
      com quem roubou.
    */
    it("encerra a sessão inteira quando um token rotacionado reaparece", async () => {
      const eu = await entra(NOTEBOOK);
      const renovada = await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .send({ refreshToken: eu.refreshToken })
        .expect(200);

      // Leva a revogação para fora da carência, como se o token velho tivesse
      // reaparecido minutos depois.
      await prisma.refreshToken.updateMany({
        where: { user: { email: pessoa.email }, revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 5 * 60_000) },
      });

      await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken: eu.refreshToken }).expect(401);

      // O token NOVO também caiu: pode ser ele o que está nas mãos erradas.
      await request(app.getHttpServer())
        .get("/api/auth/session")
        .set("Authorization", `Bearer ${renovada.body.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .send({ refreshToken: renovada.body.refreshToken })
        .expect(401);
    });

    it("dentro da carência, não trata corrida como roubo", async () => {
      // O documento e um prefetch saem juntos com o mesmo refresh token.
      const eu = await entra(NOTEBOOK);
      const primeira = await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken: eu.refreshToken }).expect(200);
      await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken: eu.refreshToken }).expect(401);

      // A sessão segue viva pelo token que venceu a corrida.
      await request(app.getHttpServer())
        .get("/api/auth/session")
        .set("Authorization", `Bearer ${primeira.body.accessToken}`)
        .expect(200);
    });
  });

  it("sair encerra a sessão e derruba o token de acesso", async () => {
    const eu = await entra(NOTEBOOK);

    await request(app.getHttpServer()).post("/api/auth/logout").send({ refreshToken: eu.refreshToken }).expect(204);

    await request(app.getHttpServer()).get("/api/auth/session").set("Authorization", `Bearer ${eu.accessToken}`).expect(401);
  });
});
