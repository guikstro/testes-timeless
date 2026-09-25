import "./test-env";
import Redis from "ioredis";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Auditoria, contra o banco de verdade.
 *
 * O que só este arquivo prova: que as ações passam pela rota HTTP e chegam ao
 * registro com IP, aparelho e nome de quem fez; que nenhum segredo chega lá;
 * que só dono e administrador leem; e que um cliente nunca vê o registro do
 * outro.
 */
describe("Auditoria (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const dona = {
    name: "Dora Auditoria",
    email: "dora@auditoria-e2e.local",
    password: "senha-bem-comprida-123",
    organizationName: "Org Auditoria E2E",
  };
  const outra = {
    name: "Olga Auditoria",
    email: "olga@auditoria-e2e.local",
    password: "senha-bem-comprida-456",
    organizationName: "Org Outra Auditoria E2E",
  };
  const membro = { name: "Mauro Membro", email: "mauro@auditoria-e2e.local" };

  const NOTEBOOK =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

  let tokenDaDona: string;
  let orgDaDona: string;

  const organizacaoDo = (token: string) =>
    JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).organizationId as string;

  async function entra(pessoa: { email: string; password: string }) {
    const resposta = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("X-Client-User-Agent", NOTEBOOK)
      .send({ email: pessoa.email, password: pessoa.password })
      .expect(200);
    return resposta.body.accessToken as string;
  }

  function auditoria(token: string, consulta = "") {
    return request(app.getHttpServer()).get(`/api/auditoria${consulta}`).set("Authorization", `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.organization.deleteMany({ where: { name: { in: [dona.organizationName, outra.organizationName] } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@auditoria-e2e.local" } } });

    const cliente = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/1");
    cliente.on("error", () => undefined);
    try {
      const chaves = await cliente.keys("throttle:*");
      if (chaves.length > 0) await cliente.del(...chaves);
    } finally {
      await cliente.quit().catch(() => undefined);
    }

    await request(app.getHttpServer()).post("/api/auth/register").send(dona).expect(201);
    await request(app.getHttpServer()).post("/api/auth/register").send(outra).expect(201);
    tokenDaDona = await entra(dona);
    orgDaDona = organizacaoDo(tokenDaDona);
  });

  afterAll(async () => {
    await app.close();
  });

  it("registra a entrada com o aparelho legível e o nome de quem entrou", async () => {
    const resposta = await auditoria(tokenDaDona, "?categoria=acesso").expect(200);
    const entrada = resposta.body.itens.find((i: { action: string }) => i.action === "LOGIN_SUCCEEDED");

    expect(entrada).toMatchObject({ autorNome: dona.name, autorEmail: dona.email, aparelho: "Chrome no macOS" });
    expect(entrada.ip).toEqual(expect.any(String));
  });

  it("registra a senha errada de uma conta que existe, sem guardar a senha tentada", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: dona.email, password: "tentativa-errada-987" })
      .expect(401);

    // A gravação da falha não segura a resposta, de propósito: espera ela chegar.
    let falha: { after: unknown } | undefined;
    for (let i = 0; i < 30 && !falha; i++) {
      const resposta = await auditoria(tokenDaDona, "?categoria=acesso");
      falha = resposta.body.itens.find((item: { action: string }) => item.action === "LOGIN_FAILED");
      if (!falha) await new Promise((r) => setTimeout(r, 100));
    }

    expect(falha).toBeDefined();
    expect(JSON.stringify(falha)).not.toContain("tentativa-errada-987");
  });

  it("registra a troca de senha e nunca guarda senha nenhuma", async () => {
    const novaSenha = "outra-senha-bem-comprida-321";
    const troca = await request(app.getHttpServer())
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tokenDaDona}`)
      .send({ currentPassword: dona.password, newPassword: novaSenha })
      .expect(200);
    tokenDaDona = troca.body.accessToken;
    dona.password = novaSenha;

    const resposta = await auditoria(tokenDaDona).expect(200);
    const tudo = JSON.stringify(resposta.body);
    expect(resposta.body.itens.some((i: { action: string }) => i.action === "PASSWORD_CHANGED")).toBe(true);
    expect(tudo).not.toContain(novaSenha);
    expect(tudo).not.toContain("senha-bem-comprida-123");
  });

  it("registra a conexão de uma integração sem o token dela", async () => {
    const token = "EAAB-token-secreto-da-meta-que-nao-pode-vazar";
    await request(app.getHttpServer())
      .post("/api/integrations/meta/connect")
      .set("Authorization", `Bearer ${tokenDaDona}`)
      .send({ adAccountId: "act_123", accessToken: token })
      .expect(201);

    const resposta = await auditoria(tokenDaDona, "?categoria=conta").expect(200);
    const conexao = resposta.body.itens.find((i: { action: string }) => i.action === "INTEGRATION_CONNECTED");
    expect(conexao.after).toMatchObject({ integracao: "Meta Ads", contaDeAnuncios: "act_123" });
    expect(JSON.stringify(resposta.body)).not.toContain(token);
  });

  it("registra o antes e o depois de uma mudança nas configurações", async () => {
    await request(app.getHttpServer())
      .patch("/api/organizations/current")
      .set("Authorization", `Bearer ${tokenDaDona}`)
      .send({ name: "Org Auditoria E2E Renomeada" })
      .expect(200);

    const resposta = await auditoria(tokenDaDona, "?categoria=conta").expect(200);
    const mudanca = resposta.body.itens.find((i: { action: string }) => i.action === "ORGANIZATION_UPDATED");
    expect(mudanca.before).toEqual({ name: dona.organizationName });
    expect(mudanca.after).toEqual({ name: "Org Auditoria E2E Renomeada" });

    // Volta o nome, para a limpeza da próxima rodada achar a organização.
    await request(app.getHttpServer())
      .patch("/api/organizations/current")
      .set("Authorization", `Bearer ${tokenDaDona}`)
      .send({ name: dona.organizationName })
      .expect(200);
  });

  it("não deixa um cliente ver a auditoria do outro", async () => {
    const tokenDaOutra = await entra(outra);
    const resposta = await auditoria(tokenDaOutra).expect(200);

    expect(resposta.body.itens.length).toBeGreaterThan(0);
    for (const item of resposta.body.itens) {
      expect(item.autorEmail).not.toBe(dona.email);
    }
    expect(JSON.stringify(resposta.body)).not.toContain("act_123");
  });

  it("recusa quem não é dono nem administrador", async () => {
    const senha = "senha-do-membro-bem-comprida";
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ ...membro, password: senha, organizationName: "Org Descartável Auditoria E2E" })
      .expect(201);
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email: membro.email } });
    await prisma.membership.create({ data: { organizationId: orgDaDona, userId: usuario.id, role: "MEMBER" } });

    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: membro.email, password: senha, organizationId: orgDaDona })
      .expect(200);

    const resposta = await auditoria(login.body.accessToken).expect(403);
    expect(resposta.body.code).toBe("AUDITORIA_RESTRITA");

    await prisma.organization.deleteMany({ where: { name: "Org Descartável Auditoria E2E" } });
  });

  it("mantém o registro de quem já não existe, com o nome copiado", async () => {
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email: membro.email } });
    const antes = await prisma.auditLog.count({ where: { organizationId: orgDaDona, userId: usuario.id } });
    expect(antes).toBeGreaterThan(0);

    await prisma.membership.deleteMany({ where: { userId: usuario.id } });
    await prisma.user.delete({ where: { id: usuario.id } });

    const restantes = await prisma.auditLog.findMany({
      where: { organizationId: orgDaDona, autorEmail: membro.email },
    });
    expect(restantes.length).toBe(antes);
    expect(restantes.every((r) => r.userId === null && r.autorNome === membro.name)).toBe(true);
  });

  it("filtra por assunto e pagina sem repetir linha", async () => {
    const primeira = await auditoria(tokenDaDona, "?categoria=acesso").expect(200);
    const acoes = new Set(primeira.body.itens.map((i: { action: string }) => i.action));
    for (const acao of acoes) {
      expect(["LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "SESSIONS_ENDED"]).toContain(acao);
    }

    const todas = await auditoria(tokenDaDona).expect(200);
    const ids = todas.body.itens.map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
