import "./test-env";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { EncryptionService } from "../src/common/encryption/encryption.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { confereCodigo, decodificaBase32, geraCodigo, passoDe } from "../src/auth/mfa/totp";

/**
 * O fluxo inteiro do segundo fator, contra o banco de verdade.
 *
 * Os testes de unidade provam o algoritmo e as regras. Este prova o que só o
 * banco pode provar: que o segredo é guardado cifrado, que o login realmente
 * para antes de emitir sessão, que o código gasto não serve de novo depois de
 * um ciclo completo de requisições, e que a administração fecha para operador
 * sem fator configurado.
 */
describe("MFA (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let encryption: EncryptionService;

  const usuario = {
    name: "Ana MFA",
    email: "ana@mfa-e2e.local",
    password: "senha-bem-comprida-123",
    organizationName: "Org MFA E2E",
  };

  let token: string;
  let userId: string;

  /** O código que o aplicativo autenticador mostraria agora. */
  function codigoAtual(segredo: string): string {
    return geraCodigo(decodificaBase32(segredo), passoDe(Math.floor(Date.now() / 1000)));
  }

  /**
   * Código válido agora, com a janela de reuso liberada.
   *
   * A proteção contra reuso é real e está testada em unidade: um código só
   * vale uma vez. Isso torna impossível usar dois códigos numa mesma suíte sem
   * esperar trinta segundos por vez, então aqui a janela é liberada de
   * propósito antes de cada uso. O que este arquivo prova é o fluxo pelas
   * rotas, não a regra de reuso.
   */
  async function codigoUsavel(segredo: string): Promise<string> {
    await prisma.userMfa.updateMany({ where: { userId }, data: { ultimoPassoUsado: null } });
    return codigoAtual(segredo);
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();

    prisma = moduleRef.get(PrismaService);
    encryption = moduleRef.get(EncryptionService);

    /*
      Limpa o que esta suíte deixou numa rodada anterior.

      Só o que é dela: o schema `test` é compartilhado entre as suítes, e
      apagar tudo aqui derrubaria as outras que rodam em paralelo.
    */
    await prisma.organization.deleteMany({ where: { name: usuario.organizationName } });
    await prisma.user.deleteMany({ where: { email: usuario.email } });

    const registro = await request(app.getHttpServer()).post("/api/auth/register").send(usuario).expect(201);
    token = registro.body.accessToken;
    userId = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).sub;
  });

  afterAll(async () => {
    await app.close();
  });

  let segredo: string;
  let codigosDeRecuperacao: string[];

  describe("inscrição", () => {
    it("começa desligado", async () => {
      const resposta = await request(app.getHttpServer())
        .get("/api/auth/mfa")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(resposta.body).toMatchObject({ ativo: false, pendente: false, exigido: false });
    });

    it("gera o segredo e o endereço do QR", async () => {
      const resposta = await request(app.getHttpServer())
        .post("/api/auth/mfa/inscricao")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      segredo = resposta.body.segredo;
      expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
      expect(resposta.body.endereco).toContain("otpauth://totp/Timeless%3Aana%40mfa-e2e.local");
    });

    it("guarda o segredo cifrado, nunca em texto", async () => {
      const guardado = await prisma.userMfa.findUnique({ where: { userId } });

      expect(guardado!.secretEncrypted).not.toContain(segredo);
      // E é recuperável com a chave, senão não haveria como conferir código.
      expect(encryption.decrypt(guardado!.secretEncrypted)).toBe(segredo);
    });

    /*
      Segredo gerado e ainda não provado não liga o fator. Se ligasse, quem
      fechasse a aba no meio da configuração ficaria trancado fora da conta.
    */
    it("ainda não está ativo, só pendente", async () => {
      const resposta = await request(app.getHttpServer())
        .get("/api/auth/mfa")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(resposta.body).toMatchObject({ ativo: false, pendente: true });
    });

    it("o login continua entregando sessão enquanto a inscrição não é confirmada", async () => {
      const resposta = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: usuario.email, password: usuario.password })
        .expect(200);

      expect(resposta.body.accessToken).toEqual(expect.any(String));
      expect(resposta.body.mfaObrigatorio).toBeUndefined();
    });

    it("recusa código errado na confirmação", async () => {
      const resposta = await request(app.getHttpServer())
        .post("/api/auth/mfa/inscricao/confirmar")
        .set("Authorization", `Bearer ${token}`)
        .send({ codigo: "000000" })
        .expect(401);

      expect(resposta.body.code).toBe("MFA_CODIGO_INVALIDO");
    });

    it("confirma com o código certo e entrega os códigos de recuperação", async () => {
      const resposta = await request(app.getHttpServer())
        .post("/api/auth/mfa/inscricao/confirmar")
        .set("Authorization", `Bearer ${token}`)
        .send({ codigo: codigoAtual(segredo) })
        .expect(201);

      codigosDeRecuperacao = resposta.body.codigos;
      expect(codigosDeRecuperacao).toHaveLength(10);
      expect(codigosDeRecuperacao[0]).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    });

    it("guarda os códigos como hash, e não em texto", async () => {
      const guardados = await prisma.mfaRecoveryCode.findMany({ where: { userId } });

      expect(guardados).toHaveLength(10);
      for (const guardado of guardados) {
        expect(codigosDeRecuperacao).not.toContain(guardado.codeHash);
        expect(guardado.codeHash).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  describe("login com segundo fator", () => {
    /*
      O ponto do recurso inteiro: nenhum token de sessão sai do login. Emitir a
      sessão e "completar" depois faria o fator ser um aviso, não uma tranca.
    */
    it("não entrega sessão nenhuma, só um desafio", async () => {
      const resposta = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: usuario.email, password: usuario.password })
        .expect(200);

      expect(resposta.body).toMatchObject({ mfaObrigatorio: true, desafio: expect.any(String) });
      expect(resposta.body.accessToken).toBeUndefined();
      expect(resposta.body.refreshToken).toBeUndefined();
    });

    it("troca o desafio pela sessão com o código do aplicativo", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: usuario.email, password: usuario.password })
        .expect(200);

      const resposta = await request(app.getHttpServer())
        .post("/api/auth/mfa/completar")
        .send({ desafio: login.body.desafio, codigo: await codigoUsavel(segredo) })
        .expect(201);

      expect(resposta.body.accessToken).toEqual(expect.any(String));
      expect(resposta.body.refreshToken).toEqual(expect.any(String));
    });

    it("recusa um token de sessão apresentado como desafio", async () => {
      // Sem a conferência de propósito, um access token roubado pularia o
      // segundo fator inteiro.
      const resposta = await request(app.getHttpServer())
        .post("/api/auth/mfa/completar")
        .send({ desafio: token, codigo: await codigoUsavel(segredo) })
        .expect(401);

      expect(resposta.body.code).toBe("DESAFIO_INVALIDO");
    });

    it("aceita um código de recuperação, e ele não serve de novo", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: usuario.email, password: usuario.password })
        .expect(200);

      const usado = codigosDeRecuperacao[0];
      await request(app.getHttpServer())
        .post("/api/auth/mfa/completar")
        .send({ desafio: login.body.desafio, codigo: usado })
        .expect(201);

      const segundoLogin = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: usuario.email, password: usuario.password })
        .expect(200);

      // Uso único: o papel perdido não pode valer o mesmo que o guardado.
      await request(app.getHttpServer())
        .post("/api/auth/mfa/completar")
        .send({ desafio: segundoLogin.body.desafio, codigo: usado })
        .expect(401);
    });

    it("conta quantos códigos ainda restam", async () => {
      const resposta = await request(app.getHttpServer())
        .get("/api/auth/mfa")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(resposta.body).toMatchObject({ ativo: true, pendente: false, codigosRestantes: 9 });
    });
  });

  describe("desligar", () => {
    it("exige a senha, não só o código", async () => {
      // Só o código bastaria para quem estivesse com a sessão aberta.
      const resposta = await request(app.getHttpServer())
        .delete("/api/auth/mfa")
        .set("Authorization", `Bearer ${token}`)
        .send({ senha: "senha-errada", codigo: await codigoUsavel(segredo) })
        .expect(401);

      expect(resposta.body.code).toBe("INVALID_CREDENTIALS");
    });

    it("desliga com senha e código, e apaga segredo e códigos", async () => {
      await request(app.getHttpServer())
        .delete("/api/auth/mfa")
        .set("Authorization", `Bearer ${token}`)
        .send({ senha: usuario.password, codigo: await codigoUsavel(segredo) })
        .expect(204);

      expect(await prisma.userMfa.findUnique({ where: { userId } })).toBeNull();
      expect(await prisma.mfaRecoveryCode.count({ where: { userId } })).toBe(0);

      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: usuario.email, password: usuario.password })
        .expect(200);
      expect(login.body.accessToken).toEqual(expect.any(String));
    });
  });

  describe("obrigatório para operadores da plataforma", () => {
    /*
      A exigência fica na porta da administração, e não no login: o operador
      continua usando a própria conta como qualquer usuário enquanto não
      configura. Exigir no login trancaria para fora do produto inteiro quem já
      tinha conta antes desta mudança.
    */
    it("fecha a administração para operador sem segundo fator", async () => {
      await prisma.user.update({ where: { id: userId }, data: { platformRole: "ADMIN" } });

      const resposta = await request(app.getHttpServer())
        .get("/api/admin/organizations")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(resposta.body.code).toBe("MFA_OBRIGATORIO");
    });

    it("mas o resto do produto continua acessível", async () => {
      await request(app.getHttpServer())
        .get("/api/auth/session")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("e a situação passa a dizer que o fator é exigido", async () => {
      const resposta = await request(app.getHttpServer())
        .get("/api/auth/mfa")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(resposta.body).toMatchObject({ ativo: false, exigido: true });
    });

    it("abre depois de configurar", async () => {
      const inscricao = await request(app.getHttpServer())
        .post("/api/auth/mfa/inscricao")
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/auth/mfa/inscricao/confirmar")
        .set("Authorization", `Bearer ${token}`)
        .send({ codigo: codigoAtual(inscricao.body.segredo) })
        .expect(201);

      await request(app.getHttpServer())
        .get("/api/admin/organizations")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });
  });

  describe("reuso de código", () => {
    it("recusa o mesmo código duas vezes", async () => {
      const mfa = await prisma.userMfa.findUnique({ where: { userId } });
      const atual = encryption.decrypt(mfa!.secretEncrypted);
      const agora = Math.floor(Date.now() / 1000);

      // O primeiro uso grava o passo; o segundo precisa ser recusado mesmo
      // estando dentro da janela de validade.
      const codigo = geraCodigo(decodificaBase32(atual), passoDe(agora) + 20);
      expect(confereCodigo(atual, codigo, agora + 20 * 30).valido).toBe(true);
      expect(confereCodigo(atual, codigo, agora + 20 * 30, passoDe(agora) + 20).valido).toBe(false);
    });
  });
});
