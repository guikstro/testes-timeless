import "./test-env";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { EncryptionService } from "../src/common/encryption/encryption.service";
import { decodificaBase32, geraCodigo, geraSegredo, passoDe } from "../src/auth/mfa/totp";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * A conta da equipe muda de dono: alguém que já tinha conta entra na equipe
 * pelo convite, e a posse passa para ela com o código do autenticador. Nunca
 * para quem não é da equipe.
 */
describe("Posse da conta da equipe (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let encryption: EncryptionService;

  const senha = "senha-bem-comprida-posse";
  const dono = { name: "Adriano", email: "adriano@posse-e2e.local", organizationName: "Posse E2E Equipe" };
  const gui = { name: "Guilherme", email: "gui@posse-e2e.local", organizationName: "Posse E2E Conta do Gui" };
  const cliente = { name: "Cliente", email: "cliente@posse-e2e.local", organizationName: "Posse E2E Cliente" };

  let segredo: string;
  let tokenDoDono: string;
  let equipeId: string;
  let donoId: string;
  let guiId: string;

  const doToken = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  const codigoAtual = () => geraCodigo(decodificaBase32(segredo), passoDe(Math.floor(Date.now() / 1000)));
  const entra = async (email: string) =>
    (await request(app.getHttpServer()).post("/api/auth/login").send({ email, password: senha }).expect(200)).body.accessToken as string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health"] });
    await app.init();
    prisma = moduleRef.get(PrismaService);
    encryption = moduleRef.get(EncryptionService);

    await prisma.organization.deleteMany({ where: { name: { startsWith: "Posse E2E" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@posse-e2e.local" } } });

    for (const conta of [dono, gui, cliente]) {
      await request(app.getHttpServer()).post("/api/auth/register").send({ ...conta, password: senha }).expect(201);
    }

    // O dono da equipe é operador, com autenticador de verdade: o código é conferido.
    donoId = (await prisma.user.findUniqueOrThrow({ where: { email: dono.email } })).id;
    guiId = (await prisma.user.findUniqueOrThrow({ where: { email: gui.email } })).id;
    await prisma.user.update({ where: { id: donoId }, data: { platformRole: "ADMIN" } });
    // Entra antes de ligar o autenticador: depois disso o login pede o código.
    tokenDoDono = await entra(dono.email);
    equipeId = doToken(tokenDoDono).organizationId;
    segredo = geraSegredo();
    await prisma.userMfa.create({ data: { userId: donoId, secretEncrypted: encryption.encrypt(segredo), confirmadoEm: new Date() } });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { name: { startsWith: "Posse E2E" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@posse-e2e.local" } } });
    await app.close();
  });

  it("quem já tem conta entra na equipe pelo convite com a própria senha, mesmo sem nenhuma conta onde entrar", async () => {
    const convite = await request(app.getHttpServer())
      .post("/api/admin/convites")
      .set("Authorization", `Bearer ${tokenDoDono}`)
      .send({ email: gui.email, acesso: "timeless" })
      .expect(201);
    const token = new URL(convite.body.url).pathname.split("/convite/")[1];

    const pagina = await request(app.getHttpServer()).get(`/api/publico/convites/${token}`).expect(200);
    expect(pagina.body).toMatchObject({ email: gui.email, contaExiste: true });

    // A única conta do Gui foi excluída: o login não tem para onde levá-lo.
    await prisma.organization.updateMany({ where: { name: gui.organizationName }, data: { deletedAt: new Date() } });
    const semConta = await request(app.getHttpServer()).post("/api/auth/login").send({ email: gui.email, password: senha }).expect(403);
    expect(semConta.body.code).toBe("NO_ORGANIZATION");

    // Senha errada não aceita, e não gasta o link.
    const recusa = await request(app.getHttpServer())
      .post(`/api/publico/convites/${token}/com-senha`)
      .send({ senha: "senha-de-outra-pessoa" })
      .expect(401);
    expect(recusa.body.code).toBe("INVALID_CREDENTIALS");

    const aceite = await request(app.getHttpServer())
      .post(`/api/publico/convites/${token}/com-senha`)
      .send({ senha })
      .expect(200);
    expect(doToken(aceite.body.accessToken)).toMatchObject({ organizationId: equipeId, role: "ADMIN" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guiId } })).platformRole).toBe("ADMIN");

    // E agora o login volta a funcionar, levando para a equipe.
    expect(doToken(await entra(gui.email))).toMatchObject({ organizationId: equipeId });

    // O link valeu uma vez.
    await request(app.getHttpServer()).get(`/api/publico/convites/${token}`).expect(404);
  });

  it("a lista da equipe diz quem é da equipe", async () => {
    const membros = await request(app.getHttpServer())
      .get("/api/organizations/current/members")
      .set("Authorization", `Bearer ${tokenDoDono}`)
      .expect(200);
    expect(membros.body.find((m: { email: string }) => m.email === gui.email)).toMatchObject({ daEquipe: true, role: "ADMIN" });
  });

  it("nunca passa a posse para quem não é da equipe", async () => {
    const clienteId = (await prisma.user.findUniqueOrThrow({ where: { email: cliente.email } })).id;
    await prisma.membership.create({ data: { organizationId: equipeId, userId: clienteId, role: "MEMBER", areas: ["leads"] } });

    const resposta = await request(app.getHttpServer())
      .post("/api/organizations/current/transferir-posse")
      .set("Authorization", `Bearer ${tokenDoDono}`)
      .send({ userId: clienteId, codigo: codigoAtual() })
      .expect(403);
    expect(resposta.body.code).toBe("SO_PARA_A_EQUIPE");

    await prisma.membership.delete({ where: { organizationId_userId: { organizationId: equipeId, userId: clienteId } } });
  });

  it("código errado não passa nada", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/api/organizations/current/transferir-posse")
      .set("Authorization", `Bearer ${tokenDoDono}`)
      .send({ userId: guiId, codigo: "000000" })
      .expect(400);
    expect(resposta.body.code).toBe("CODIGO_INVALIDO");
  });

  it("com o código certo, a posse passa, quem transferiu vira administrador e fica registrado", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/api/organizations/current/transferir-posse")
      .set("Authorization", `Bearer ${tokenDoDono}`)
      .send({ userId: guiId, codigo: codigoAtual() })
      .expect(200);
    expect(doToken(resposta.body.accessToken)).toMatchObject({ sub: donoId, organizationId: equipeId, role: "ADMIN" });

    const papeis = await prisma.membership.findMany({ where: { organizationId: equipeId }, select: { userId: true, role: true } });
    expect(papeis).toEqual(expect.arrayContaining([
      { userId: guiId, role: "OWNER" },
      { userId: donoId, role: "ADMIN" },
    ]));
    expect(await prisma.auditLog.count({ where: { organizationId: equipeId, action: "OWNERSHIP_TRANSFERRED" } })).toBe(1);

    // Com o papel novo, não transfere mais.
    const deNovo = await request(app.getHttpServer())
      .post("/api/organizations/current/transferir-posse")
      .set("Authorization", `Bearer ${resposta.body.accessToken}`)
      .send({ userId: guiId, codigo: "123456" })
      .expect(403);
    expect(deNovo.body.code).toBe("OWNER_REQUIRED");
  });
});
