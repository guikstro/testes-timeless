import "./test-env";
import { createHash } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

function decodeJwt(accessToken: string): { sub: string; organizationId: string; impersonating?: true } {
  return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString("utf8"));
}

describe("Administração da plataforma (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** Assina tokens forjados nos testes de prazo, usando a mesma chave da aplicação. */
  let jwtService: JwtService;

  let adminToken: string;
  let adminUserId: string;
  let clientToken: string;
  let clientOrgId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health"] });
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);

    await prisma.organization.deleteMany({ where: { name: { contains: "Admin E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "admin-e2e" } } });

    const adminRegistration = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "Operador",
      email: "operador@admin-e2e.local",
      password: "password123",
      organizationName: "Admin E2E Plataforma",
    });
    adminToken = adminRegistration.body.accessToken;
    adminUserId = decodeJwt(adminToken).sub;

    const clientRegistration = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "Cliente",
      email: "cliente@admin-e2e.local",
      password: "password123",
      organizationName: "Admin E2E Cliente",
    });
    clientToken = clientRegistration.body.accessToken;
    clientOrgId = decodeJwt(clientToken).organizationId;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("antes de receber o acesso de operador", () => {
    it("não deixa um usuário comum listar as organizações", async () => {
      await request(app.getHttpServer())
        .get("/api/admin/organizations")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(403);
    });

    it("não deixa um usuário comum entrar em outra organização", async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(403);
    });

    it("exige autenticação", async () => {
      await request(app.getHttpServer()).get("/api/admin/organizations").expect(401);
    });
  });

  describe("depois de receber o acesso de operador", () => {
    beforeAll(async () => {
      // Direto no banco porque este é o bootstrap: o primeiro ADMIN não tem
      // quem o promova pela API (as rotas de gestão exigem já ser ADMIN).
      await prisma.user.update({ where: { id: adminUserId }, data: { platformRole: "ADMIN" } });
    });

    it("lista as organizações com as métricas do painel", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/admin/organizations?search=Admin E2E Cliente")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject({
        id: clientOrgId,
        name: "Admin E2E Cliente",
        leadCount: 0,
        saleCount: 0,
        revenueCents: 0,
      });
      expect(response.body.items[0].owner.email).toBe("cliente@admin-e2e.local");
    });

    it("continua sem permitir que o cliente acesse a administração", async () => {
      await request(app.getHttpServer())
        .get("/api/admin/organizations")
        .set("Authorization", `Bearer ${clientToken}`)
        .expect(403);
    });

    it("entra no cliente emitindo um token do operador dentro da organização dele", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      const payload = decodeJwt(response.body.accessToken);
      expect(payload.organizationId).toBe(clientOrgId);
      // O dono do token continua sendo o operador — é o que faz a auditoria
      // apontar para quem realmente agiu.
      expect(payload.sub).toBe(adminUserId);
      expect(payload.impersonating).toBe(true);
    });

    it("registra o acesso em auditoria", async () => {
      const entries = await prisma.auditLog.findMany({
        where: { organizationId: clientOrgId, action: "IMPERSONATION_STARTED" },
      });

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].userId).toBe(adminUserId);
    });

    it("o token de impersonação enxerga os dados do cliente, e não os do operador", async () => {
      const impersonation = await request(app.getHttpServer())
        .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      const session = await request(app.getHttpServer())
        .get("/api/auth/session")
        .set("Authorization", `Bearer ${impersonation.body.accessToken}`)
        .expect(200);

      expect(session.body.organization.id).toBe(clientOrgId);
      expect(session.body.impersonating).toBe(true);
      expect(session.body.user.email).toBe("operador@admin-e2e.local");
    });

    it("uma sessão de impersonação não consegue voltar à administração nem pular para outro cliente", async () => {
      const impersonation = await request(app.getHttpServer())
        .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/api/admin/organizations")
        .set("Authorization", `Bearer ${impersonation.body.accessToken}`)
        .expect(403);

      expect(response.body.code).toBe("ALREADY_IMPERSONATING");
    });

    /**
     * Se a marca se perdesse na renovação, o operador acabaria com uma sessão
     * comum dentro do cliente — sem aviso na tela e sem rastreabilidade.
     */
    it("a marca de impersonação sobrevive ao refresh do token", async () => {
      const impersonation = await request(app.getHttpServer())
        .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      const refreshed = await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .send({ refreshToken: impersonation.body.refreshToken })
        .expect(200);

      const payload = decodeJwt(refreshed.body.accessToken);
      expect(payload.impersonating).toBe(true);
      expect(payload.organizationId).toBe(clientOrgId);
      expect(payload.sub).toBe(adminUserId);
    });

    it("revogar o acesso de operador tem efeito imediato, sem esperar o token expirar", async () => {
      await prisma.user.update({ where: { id: adminUserId }, data: { platformRole: null } });

      await request(app.getHttpServer())
        .get("/api/admin/organizations")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(403);

      await prisma.user.update({ where: { id: adminUserId }, data: { platformRole: "ADMIN" } });
    });

    it("recusa uma organização inexistente", async () => {
      await request(app.getHttpServer())
        .post("/api/admin/organizations/00000000-0000-4000-8000-000000000000/impersonate")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });

    describe("prazo da visita", () => {
      it("devolve um prazo de 30 minutos ao entrar", async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(201);

        const now = Math.floor(Date.now() / 1000);
        expect(response.body.expiresAt).toBeGreaterThan(now + 29 * 60);
        expect(response.body.expiresAt).toBeLessThanOrEqual(now + 30 * 60 + 5);
      });

      /**
       * Um token de impersonação vencido precisa parar de valer em qualquer
       * rota, não só no refresh — senão a sessão continuaria viva dentro do
       * cliente até o access token expirar sozinho.
       */
      it("recusa um token de impersonação já vencido em qualquer rota autenticada", async () => {
        const expired = await jwtService.signAsync(
          {
            sub: adminUserId,
            organizationId: clientOrgId,
            role: "OWNER",
            impersonating: true,
            impersonationExpiresAt: Math.floor(Date.now() / 1000) - 60,
            jti: "expired-test",
          },
          { expiresIn: "15m" },
        );

        const response = await request(app.getHttpServer())
          .get("/api/auth/session")
          .set("Authorization", `Bearer ${expired}`)
          .expect(401);

        expect(response.body.code).toBe("IMPERSONATION_EXPIRED");
      });

      it("o refresh não estende o prazo original da visita", async () => {
        const impersonation = await request(app.getHttpServer())
          .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(201);

        const refreshed = await request(app.getHttpServer())
          .post("/api/auth/refresh")
          .send({ refreshToken: impersonation.body.refreshToken })
          .expect(200);

        const payload = decodeJwt(refreshed.body.accessToken) as { impersonationExpiresAt?: number };
        expect(payload.impersonationExpiresAt).toBe(impersonation.body.expiresAt);
      });

      it("o refresh recusa uma visita já vencida em vez de emitir um token novo", async () => {
        const expiredRefresh = await jwtService.signAsync(
          {
            sub: adminUserId,
            organizationId: clientOrgId,
            role: "OWNER",
            impersonating: true,
            impersonationExpiresAt: Math.floor(Date.now() / 1000) - 60,
            jti: "expired-refresh-test",
          },
          { expiresIn: "7d" },
        );

        // O refresh exige que o token exista e esteja ativo no banco.
        await prisma.refreshToken.create({
          data: {
            userId: adminUserId,
            tokenHash: createHash("sha256").update(expiredRefresh).digest("hex"),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        const response = await request(app.getHttpServer())
          .post("/api/auth/refresh")
          .send({ refreshToken: expiredRefresh })
          .expect(401);

        expect(response.body.code).toBe("IMPERSONATION_EXPIRED");
      });
    });

    describe("níveis de operador", () => {
      let supportToken: string;
      let supportUserId: string;

      beforeAll(async () => {
        const registration = await request(app.getHttpServer()).post("/api/auth/register").send({
          name: "Atendente",
          email: "atendente@admin-e2e.local",
          password: "password123",
          organizationName: "Admin E2E Suporte",
        });
        supportToken = registration.body.accessToken;
        supportUserId = decodeJwt(supportToken).sub;
      });

      it("um ADMIN promove alguém a SUPPORT", async () => {
        const response = await request(app.getHttpServer())
          .put("/api/admin/operators")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ email: "atendente@admin-e2e.local", role: "SUPPORT" })
          .expect(200);

        expect(response.body).toMatchObject({ id: supportUserId, platformRole: "SUPPORT" });
      });

      it("o SUPPORT enxerga os clientes e entra neles — é o trabalho dele", async () => {
        await request(app.getHttpServer())
          .get("/api/admin/organizations")
          .set("Authorization", `Bearer ${supportToken}`)
          .expect(200);

        await request(app.getHttpServer())
          .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
          .set("Authorization", `Bearer ${supportToken}`)
          .expect(201);
      });

      it("o SUPPORT não consegue listar nem alterar operadores", async () => {
        const listagem = await request(app.getHttpServer())
          .get("/api/admin/operators")
          .set("Authorization", `Bearer ${supportToken}`)
          .expect(403);
        expect(listagem.body.code).toBe("INSUFFICIENT_PLATFORM_ROLE");

        await request(app.getHttpServer())
          .put("/api/admin/operators")
          .set("Authorization", `Bearer ${supportToken}`)
          .send({ email: "atendente@admin-e2e.local", role: "ADMIN" })
          .expect(403);

        await request(app.getHttpServer())
          .delete(`/api/admin/operators/${adminUserId}`)
          .set("Authorization", `Bearer ${supportToken}`)
          .expect(403);
      });

      it("recusa promover um e-mail que não tem conta — promover não cria usuário", async () => {
        const response = await request(app.getHttpServer())
          .put("/api/admin/operators")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ email: "ninguem@admin-e2e.local", role: "SUPPORT" })
          .expect(404);

        expect(response.body.code).toBe("USER_NOT_FOUND");
      });

      /**
       * Sem esta trava a plataforma poderia ficar sem nenhum ADMIN, e aí só
       * um acesso direto ao banco devolveria a gestão de operadores.
       */
      it("impede remover ou rebaixar o último administrador", async () => {
        const rebaixar = await request(app.getHttpServer())
          .put("/api/admin/operators")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ email: "operador@admin-e2e.local", role: "SUPPORT" })
          .expect(400);
        // Auto-rebaixamento é barrado antes mesmo da checagem de último admin.
        expect(rebaixar.body.code).toBe("CANNOT_DEMOTE_SELF");

        await request(app.getHttpServer())
          .delete(`/api/admin/operators/${adminUserId}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(400);
      });

      it("com dois administradores, um consegue rebaixar o outro", async () => {
        await request(app.getHttpServer())
          .put("/api/admin/operators")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ email: "atendente@admin-e2e.local", role: "ADMIN" })
          .expect(200);

        // Agora o atendente é ADMIN e consegue rebaixar o outro.
        const response = await request(app.getHttpServer())
          .put("/api/admin/operators")
          .set("Authorization", `Bearer ${supportToken}`)
          .send({ email: "operador@admin-e2e.local", role: "SUPPORT" })
          .expect(200);
        expect(response.body.platformRole).toBe("SUPPORT");

        // Restaura o estado para os testes seguintes.
        await prisma.user.update({ where: { id: adminUserId }, data: { platformRole: "ADMIN" } });
        await prisma.user.update({ where: { id: supportUserId }, data: { platformRole: "SUPPORT" } });
      });

      it("revogar devolve a pessoa à condição de usuário comum, sem apagar a conta", async () => {
        await request(app.getHttpServer())
          .delete(`/api/admin/operators/${supportUserId}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(204);

        const user = await prisma.user.findUnique({ where: { id: supportUserId } });
        expect(user).not.toBeNull();
        expect(user?.platformRole).toBeNull();

        await request(app.getHttpServer())
          .get("/api/admin/organizations")
          .set("Authorization", `Bearer ${supportToken}`)
          .expect(403);
      });

      it("a sessão informa o nível, para a interface saber o que mostrar", async () => {
        const response = await request(app.getHttpServer())
          .get("/api/auth/session")
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.user.platformRole).toBe("ADMIN");
      });
    });

    describe("transparência para o cliente", () => {
      it("o cliente enxerga, na própria conta, quem do suporte entrou nela", async () => {
        await request(app.getHttpServer())
          .post(`/api/admin/organizations/${clientOrgId}/impersonate`)
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(201);

        const response = await request(app.getHttpServer())
          .get("/api/organizations/current/support-accesses")
          .set("Authorization", `Bearer ${clientToken}`)
          .expect(200);

        expect(response.body.length).toBeGreaterThan(0);
        expect(response.body[0].user.email).toBe("operador@admin-e2e.local");
      });

      it("um cliente nunca enxerga os acessos feitos a outro cliente", async () => {
        const outra = await request(app.getHttpServer()).post("/api/auth/register").send({
          name: "Terceiro",
          email: "terceiro@admin-e2e.local",
          password: "password123",
          organizationName: "Admin E2E Terceiro",
        });

        const response = await request(app.getHttpServer())
          .get("/api/organizations/current/support-accesses")
          .set("Authorization", `Bearer ${outra.body.accessToken}`)
          .expect(200);

        expect(response.body).toEqual([]);
      });
    });
  });
});
