import "./test-env";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { EncryptionService } from "../src/common/encryption/encryption.service";
import { geraSegredo } from "../src/auth/mfa/totp";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { RegistroDeErros } from "../src/observabilidade/registro-de-erros.service";

/**
 * A saúde da plataforma: só a equipe vê, mostra cada parte e agrupa os erros.
 */
describe("Saúde da plataforma (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let registro: RegistroDeErros;
  let tokenDoOperador: string;
  let tokenDoCliente: string;

  const senha = "senha-bem-comprida-saude";

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health"] });
    await app.init();
    prisma = moduleRef.get(PrismaService);
    registro = moduleRef.get(RegistroDeErros);

    await prisma.organization.deleteMany({ where: { name: { startsWith: "Saude E2E" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@saude-e2e.local" } } });
    await prisma.erroDaPlataforma.deleteMany({ where: { tipo: { startsWith: "saude_e2e" } } });

    for (const [nome, email] of [
      ["Operador", "operador@saude-e2e.local"],
      ["Cliente", "cliente@saude-e2e.local"],
    ]) {
      await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({ name: nome, email, password: senha, organizationName: `Saude E2E ${nome}` })
        .expect(201);
    }
    const operador = await prisma.user.update({
      where: { email: "operador@saude-e2e.local" },
      data: { platformRole: "SUPPORT" },
    });
    const entra = async (email: string) =>
      (await request(app.getHttpServer()).post("/api/auth/login").send({ email, password: senha }).expect(200)).body
        .accessToken as string;
    tokenDoOperador = await entra("operador@saude-e2e.local");
    tokenDoCliente = await entra("cliente@saude-e2e.local");
    // A porta da administração exige segundo fator; o fluxo dele tem suíte própria.
    await prisma.userMfa.create({
      data: { userId: operador.id, secretEncrypted: moduleRef.get(EncryptionService).encrypt(geraSegredo()), confirmadoEm: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.erroDaPlataforma.deleteMany({ where: { tipo: { startsWith: "saude_e2e" } } });
    await prisma.organization.deleteMany({ where: { name: { startsWith: "Saude E2E" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@saude-e2e.local" } } });
    await app.close();
  });

  it("mostra banco, Redis, as seis filas, as integrações e os pedidos da última hora", async () => {
    const resposta = await request(app.getHttpServer())
      .get("/api/admin/saude")
      .set("Authorization", `Bearer ${tokenDoOperador}`)
      .expect(200);

    expect(resposta.body.banco).toMatchObject({ ok: true });
    expect(resposta.body.redis).toMatchObject({ ok: true });
    expect(resposta.body.filas).toHaveLength(6);
    expect(resposta.body.integracoes).toEqual(
      expect.objectContaining({ whatsapp: expect.any(Object), meta: expect.any(Object), google: expect.any(Object), capi: expect.any(Object) }),
    );
    // Os pedidos do cadastro e da entrada, acima, já foram medidos.
    expect(resposta.body.requisicoes.pedidos).toBeGreaterThan(0);
  });

  it("cliente não vê", async () => {
    await request(app.getHttpServer()).get("/api/admin/saude").set("Authorization", `Bearer ${tokenDoCliente}`).expect(403);
    await request(app.getHttpServer()).get("/api/admin/erros").set("Authorization", `Bearer ${tokenDoCliente}`).expect(403);
  });

  it("agrupa o mesmo erro, resolve, e reabre quando volta", async () => {
    const erro = { origem: "api" as const, tipo: "saude_e2e_falha", mensagem: "Lead 3f2a1b9c-1111-4222-8333-944455556666 sem conversa" };
    await registro.registra(erro);
    await registro.registra({ ...erro, mensagem: "Lead 9b1c2d3e-aaaa-4bbb-8ccc-dddddddddddd sem conversa" });

    const lista = async () =>
      (
        await request(app.getHttpServer()).get("/api/admin/erros").set("Authorization", `Bearer ${tokenDoOperador}`).expect(200)
      ).body.filter((e: { tipo: string }) => e.tipo === "saude_e2e_falha");

    const [agrupado] = await lista();
    expect(agrupado.ocorrencias).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/admin/erros/${agrupado.id}/resolver`)
      .set("Authorization", `Bearer ${tokenDoOperador}`)
      .expect(204);
    expect(await lista()).toHaveLength(0);

    await registro.registra(erro);
    const [reaberto] = await lista();
    expect(reaberto).toMatchObject({ id: agrupado.id, ocorrencias: 3, resolvidoEm: null });
  });

  it("o erro que o navegador relata entra na lista, agrupado pela tela", async () => {
    await request(app.getHttpServer())
      .post("/api/telemetria/erro")
      .send({ mensagem: "saude_e2e: x is undefined", caminho: "/leads/3f2a1b9c-1111-4222-8333-944455556666" })
      .expect(204);

    // O registro do navegador não é esperado pela resposta; dá um instante a ele.
    await new Promise((pronto) => setTimeout(pronto, 300));
    const registro = await prisma.erroDaPlataforma.findFirst({ where: { mensagem: "saude_e2e: x is undefined" } });
    expect(registro).toMatchObject({ origem: "navegador", tipo: "erro_na_tela" });
    await prisma.erroDaPlataforma.deleteMany({ where: { mensagem: "saude_e2e: x is undefined" } });
  });
});
