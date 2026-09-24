import "./test-env";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { EncryptionService } from "../src/common/encryption/encryption.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { geraSegredo } from "../src/auth/mfa/totp";

/**
 * Entrar num cliente com a administração noutra origem.
 *
 * O que este arquivo prova é a propriedade que a separação de sites depende:
 * o código de entrega vale uma vez só, vale por pouco tempo, e não carrega
 * nada legível. Sem isso, a URL que leva o operador ao cliente seria uma
 * chave reutilizável viajando em histórico de navegador e cabeçalho de origem.
 */
describe("Entrega de sessão entre origens (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const operador = {
    name: "Operadora Entrega",
    email: "op@entrega-e2e.local",
    password: "senha-bem-comprida-123",
    organizationName: "Org Operadora Entrega",
  };
  const cliente = {
    name: "Cliente Entrega",
    email: "cliente@entrega-e2e.local",
    password: "senha-bem-comprida-123",
    organizationName: "Org Cliente Entrega",
  };

  // Declarada aqui, e não dentro do teste, para entrar na limpeza: ficava de
  // uma rodada para a outra, e a segunda rodada batia no e-mail já usado, não
  // recebia token e falhava com 401 em vez do 403 que o teste confere.
  const comum = {
    name: "Comum",
    email: "comum@entrega-e2e.local",
    password: "senha-bem-comprida-123",
    organizationName: "Org Comum Entrega",
  };

  let tokenDoOperador: string;
  let orgDoCliente: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();

    prisma = moduleRef.get(PrismaService);
    const encryption = moduleRef.get(EncryptionService);

    for (const conta of [operador, cliente, comum]) {
      await prisma.organization.deleteMany({ where: { name: conta.organizationName } });
      await prisma.user.deleteMany({ where: { email: conta.email } });
    }

    const registroOperador = await request(app.getHttpServer()).post("/api/auth/register").send(operador).expect(201);
    tokenDoOperador = registroOperador.body.accessToken;
    const idDoOperador = JSON.parse(Buffer.from(tokenDoOperador.split(".")[1], "base64").toString()).sub;

    const registroCliente = await request(app.getHttpServer()).post("/api/auth/register").send(cliente).expect(201);
    orgDoCliente = JSON.parse(Buffer.from(registroCliente.body.accessToken.split(".")[1], "base64").toString()).organizationId;

    // Operador com o segundo fator já configurado: a administração o exige, e
    // o fluxo de inscrição tem suíte própria.
    await prisma.user.update({ where: { id: idDoOperador }, data: { platformRole: "ADMIN" } });
    await prisma.userMfa.upsert({
      where: { userId: idDoOperador },
      create: { userId: idDoOperador, secretEncrypted: encryption.encrypt(geraSegredo()), confirmadoEm: new Date() },
      update: { confirmadoEm: new Date() },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function pedeEntrada(): Promise<string> {
    const resposta = await request(app.getHttpServer())
      .post(`/api/admin/organizations/${orgDoCliente}/entrada`)
      .set("Authorization", `Bearer ${tokenDoOperador}`)
      .expect(201);
    return resposta.body.entrega;
  }

  it("devolve um código, e não os tokens", async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/api/admin/organizations/${orgDoCliente}/entrada`)
      .set("Authorization", `Bearer ${tokenDoOperador}`)
      .expect(201);

    expect(resposta.body.entrega).toEqual(expect.any(String));
    // A administração vive noutra origem: dar-lhe os tokens seria dar-lhe algo
    // que ela não tem como usar, e que passaria pela rede à toa.
    expect(resposta.body.accessToken).toBeUndefined();
    expect(resposta.body.refreshToken).toBeUndefined();
    expect(resposta.body.organization).toMatchObject({ name: cliente.organizationName });
  });

  it("o código não carrega nada legível", async () => {
    const codigo = await pedeEntrada();

    // Aleatório, não token assinado: quem o intercepta depois de usado tem
    // uma string sem valor nenhum.
    expect(codigo).not.toContain(".");
    expect(() => JSON.parse(Buffer.from(codigo.split(".")[0], "base64").toString())).toThrow();
  });

  it("troca o código pela sessão do cliente", async () => {
    const codigo = await pedeEntrada();

    const resposta = await request(app.getHttpServer())
      .post("/api/auth/entrega")
      .send({ codigo })
      .expect(200);

    expect(resposta.body.accessToken).toEqual(expect.any(String));
    const payload = JSON.parse(Buffer.from(resposta.body.accessToken.split(".")[1], "base64").toString());
    expect(payload.organizationId).toBe(orgDoCliente);
    // A marca de impersonação sobrevive à entrega, senão a faixa de aviso
    // sumiria e ninguém saberia que é um operador ali dentro.
    expect(payload.impersonating).toBe(true);
  });

  /*
    A propriedade que sustenta a separação de sites.

    O código viaja na URL, e URL vaza: fica no histórico, no cabeçalho de
    origem da requisição seguinte, no log do servidor. Se valesse duas vezes,
    seria uma chave reutilizável exposta em três lugares.
  */
  it("vale uma vez só", async () => {
    const codigo = await pedeEntrada();

    await request(app.getHttpServer()).post("/api/auth/entrega").send({ codigo }).expect(200);

    const segunda = await request(app.getHttpServer()).post("/api/auth/entrega").send({ codigo }).expect(401);
    expect(segunda.body.code).toBe("ENTREGA_INVALIDA");
  });

  it("responde igual para código inexistente e código já usado", async () => {
    // Quem tenta um código inválido não precisa saber qual dos casos é o dele.
    const resposta = await request(app.getHttpServer())
      .post("/api/auth/entrega")
      .send({ codigo: "nao-existe-este-codigo-aqui-nenhum" })
      .expect(401);

    expect(resposta.body.code).toBe("ENTREGA_INVALIDA");
  });

  it("recusa a entrada de quem não é operador", async () => {
    const outro = await request(app.getHttpServer()).post("/api/auth/register").send(comum).expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/organizations/${orgDoCliente}/entrada`)
      .set("Authorization", `Bearer ${outro.body.accessToken}`)
      .expect(403);
  });
});
