import "./test-env";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

describe("Auth & multi-tenancy (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health"] });
    await app.init();

    prisma = moduleRef.get(PrismaService);

    // Clean slate: this suite owns the isolated `test` schema entirely.
    await prisma.membership.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const orgAUser = {
    name: "Usuário A",
    email: "org-a@e2e-test.local",
    password: "password123",
    organizationName: "Organização A",
  };
  const orgBUser = {
    name: "Usuário B",
    email: "org-b@e2e-test.local",
    password: "password123",
    organizationName: "Organização B",
  };

  it("registers a new organization + owner and returns a token pair", async () => {
    const response = await request(app.getHttpServer()).post("/api/auth/register").send(orgAUser).expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
  });

  it("rejects duplicate e-mails on register", async () => {
    const response = await request(app.getHttpServer()).post("/api/auth/register").send(orgAUser).expect(409);
    expect(response.body.code).toBe("EMAIL_ALREADY_IN_USE");
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const ok = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: orgAUser.email, password: orgAUser.password })
      .expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    const bad = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: orgAUser.email, password: "wrong-password" })
      .expect(401);
    expect(bad.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects unauthenticated access to organization-scoped resources", async () => {
    await request(app.getHttpServer()).get("/api/organizations/current").expect(401);
  });

  it("returns 404 for a deleted/nonexistent organization even with a valid token shape", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send(orgBUser).expect(201);

    const loginB = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: orgBUser.email, password: orgBUser.password })
      .expect(200);

    const orgB = await request(app.getHttpServer())
      .get("/api/organizations/current")
      .set("Authorization", `Bearer ${loginB.body.accessToken}`)
      .expect(200);

    expect(orgB.body.name).toBe(orgBUser.organizationName);
  });

  it("never lets one organization's token see another organization's data (tenant isolation)", async () => {
    const loginA = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: orgAUser.email, password: orgAUser.password })
      .expect(200);
    const loginB = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: orgBUser.email, password: orgBUser.password })
      .expect(200);

    const orgA = await request(app.getHttpServer())
      .get("/api/organizations/current")
      .set("Authorization", `Bearer ${loginA.body.accessToken}`)
      .expect(200);
    const orgB = await request(app.getHttpServer())
      .get("/api/organizations/current")
      .set("Authorization", `Bearer ${loginB.body.accessToken}`)
      .expect(200);

    expect(orgA.body.id).not.toBe(orgB.body.id);
    expect(orgA.body.name).toBe(orgAUser.organizationName);
    expect(orgB.body.name).toBe(orgBUser.organizationName);
  });

  it("revokes the refresh token on logout so it cannot be reused", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: orgAUser.email, password: orgAUser.password })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    const reuse = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    expect(reuse.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("a duplicated registration webhook-like retry never creates two organizations", async () => {
    const duplicate = {
      name: "Usuário C",
      email: "org-c@e2e-test.local",
      password: "password123",
      organizationName: "Organização C",
    };

    await request(app.getHttpServer()).post("/api/auth/register").send(duplicate).expect(201);
    await request(app.getHttpServer()).post("/api/auth/register").send(duplicate).expect(409);

    const count = await prisma.organization.count({ where: { name: "Organização C" } });
    expect(count).toBe(1);
  });
});
