import "./test-env";
import * as http from "http";
import { AddressInfo } from "net";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { EncryptionService } from "../src/common/encryption/encryption.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { geraSegredo } from "../src/auth/mfa/totp";
import { criaEstado } from "../src/integrations/perfil-da-empresa/estado-do-oauth";
import { AcessoAoGoogle } from "../src/integrations/perfil-da-empresa/acesso-ao-google";

/**
 * O Perfil da Empresa no Google, de ponta a ponta, contra um dublê que imita
 * a documentação: OAuth com token de renovação, contas em páginas (com uma
 * organização e um grupo sem permissão), locais e a série diária com o zero
 * omitido e os três dias que o Google ainda não contou.
 */

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diaAtras = (n: number) => new Date(Date.parse(`${hoje}T12:00:00.000Z`) - n * 86_400_000).toISOString().slice(0, 10);
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O dublê conta até quatro dias atrás: os três mais novos chegam sem valor, como no Google. */
const CONTADO_ATE = diaAtras(4);
/** Mais antigo que isto o dublê recusa, como o Google faz com o que não guarda mais. */
const GUARDADO_DESDE = diaAtras(400);

/** Os números de cada dia no dublê. Zero é omitido na resposta, como o Google faz. */
function valorDoDublê(metrica: string, dia: string): number {
  const n = Number(dia.slice(8, 10));
  switch (metrica) {
    case "CALL_CLICKS":
      return n % 4;
    case "BUSINESS_DIRECTION_REQUESTS":
      return 10 + (n % 5);
    case "WEBSITE_CLICKS":
      return n % 3;
    case "BUSINESS_IMPRESSIONS_MOBILE_MAPS":
    case "BUSINESS_IMPRESSIONS_DESKTOP_MAPS":
    case "BUSINESS_IMPRESSIONS_MOBILE_SEARCH":
    case "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH":
      return 50 + n;
    default:
      return 0;
  }
}

const somaNoDublê = (metricas: string[], de: string, ate: string) => {
  let total = 0;
  for (let dia = de; dia <= ate; dia = somaDias(dia, 1)) for (const m of metricas) total += valorDoDublê(m, dia);
  return total;
};

const pedidosDeDesempenho: string[] = [];
let revogados = 0;

function idToken(email: string): string {
  const parte = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  return `${parte({ alg: "RS256" })}.${parte({ email, email_verified: true })}.assinatura`;
}

function sobeDublê(): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      res.setHeader("Content-Type", "application/json");
      const responde = (status: number, corpo: object) => {
        res.statusCode = status;
        res.end(JSON.stringify(corpo));
      };

      let corpo = "";
      req.on("data", (pedaco) => (corpo += pedaco));
      req.on("end", () => {
        const form = new URLSearchParams(corpo);

        if (url.pathname === "/oauth2.googleapis.com/token") {
          if (form.get("client_id") !== "cliente-teste" || form.get("client_secret") !== "segredo-teste") {
            return responde(401, { error: "invalid_client", error_description: "The OAuth client was not found." });
          }
          if (form.get("grant_type") === "authorization_code") {
            if (form.get("redirect_uri") !== "http://localhost:3300/clientes/perfil-da-empresa/retorno") {
              return responde(400, { error: "redirect_uri_mismatch", error_description: "Bad Request" });
            }
            if (form.get("code") === "codigo-sem-escopo") {
              return responde(200, { access_token: "a", expires_in: 3599, refresh_token: "r", scope: "openid email", id_token: idToken("x@y.test") });
            }
            if (form.get("code") !== "codigo-bom") return responde(400, { error: "invalid_grant", error_description: "Malformed auth code." });
            return responde(200, {
              access_token: "acesso-da-troca",
              expires_in: 3599,
              refresh_token: "renova-da-equipe",
              scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/business.manage",
              token_type: "Bearer",
              id_token: idToken("equipe@timeless.test"),
            });
          }
          if (form.get("grant_type") === "refresh_token") {
            if (form.get("refresh_token") !== "renova-da-equipe") {
              return responde(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
            }
            return responde(200, { access_token: "acesso-renovado", expires_in: 3599, token_type: "Bearer" });
          }
        }

        if (url.pathname === "/oauth2.googleapis.com/revoke") {
          revogados++;
          return responde(200, {});
        }

        // Daqui para baixo, só com o token renovado.
        if (req.headers.authorization !== "Bearer acesso-renovado") {
          return responde(401, { error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } });
        }

        if (url.pathname === "/mybusinessaccountmanagement.googleapis.com/v1/accounts") {
          if (url.searchParams.get("parentAccount") === "accounts/9") {
            return responde(200, { accounts: [{ name: "accounts/3", accountName: "Grupo sem permissão", type: "LOCATION_GROUP" }] });
          }
          if (url.searchParams.get("pageToken") === "p2") {
            return responde(200, { accounts: [{ name: "accounts/2", accountName: "Clientes da agência", type: "LOCATION_GROUP" }] });
          }
          return responde(200, {
            accounts: [
              { name: "accounts/1", accountName: "Equipe", type: "PERSONAL" },
              { name: "accounts/9", accountName: "Timeless", type: "ORGANIZATION" },
            ],
            nextPageToken: "p2",
          });
        }

        const locais = /^\/mybusinessbusinessinformation\.googleapis\.com\/v1\/(accounts\/\d+)\/locations$/.exec(url.pathname);
        if (locais) {
          if (url.searchParams.get("readMask") !== "name,title,storefrontAddress") {
            return responde(400, { error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" } });
          }
          if (locais[1] === "accounts/3") {
            return responde(403, { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } });
          }
          if (locais[1] === "accounts/2" && !url.searchParams.get("pageToken")) {
            return responde(200, {
              locations: [
                {
                  name: "locations/111",
                  title: "Doca Centro",
                  storefrontAddress: { addressLines: ["Rua das Flores, 10"], locality: "Curitiba", administrativeArea: "PR" },
                },
              ],
              nextPageToken: "mais",
            });
          }
          if (locais[1] === "accounts/2") return responde(200, { locations: [{ name: "locations/222", title: "Ateliê Outro" }] });
          return responde(200, {});
        }

        const desempenho = /^\/businessprofileperformance\.googleapis\.com\/v1\/(locations\/\d+):fetchMultiDailyMetricsTimeSeries$/.exec(url.pathname);
        if (desempenho) {
          pedidosDeDesempenho.push(url.search);
          const p = url.searchParams;
          const data = (lado: string) =>
            `${p.get(`dailyRange.${lado}_date.year`)}-${String(p.get(`dailyRange.${lado}_date.month`)).padStart(2, "0")}-${String(p.get(`dailyRange.${lado}_date.day`)).padStart(2, "0")}`;
          const de = data("start");
          const ate = data("end");
          if (de < GUARDADO_DESDE) {
            return responde(400, { error: { code: 400, message: "Invalid date range.", status: "INVALID_ARGUMENT" } });
          }
          const series = p.getAll("dailyMetrics").map((metrica) => {
            const pontos = [];
            for (let dia = de; dia <= ate; dia = somaDias(dia, 1)) {
              const [year, month, day] = dia.split("-").map(Number);
              const valor = dia > CONTADO_ATE ? 0 : valorDoDublê(metrica, dia);
              pontos.push({ date: { year, month, day }, ...(valor > 0 ? { value: String(valor) } : {}) });
            }
            return { dailyMetric: metrica, timeSeries: { datedValues: pontos } };
          });
          return responde(200, { multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: series }] });
        }

        responde(404, { error: { code: 404, message: `Sem rota no dublê: ${url.pathname}`, status: "NOT_FOUND" } });
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function espera<T>(fn: () => Promise<T | null | undefined | false>, limiteMs = 15_000): Promise<T> {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const valor = await fn();
    if (valor) return valor;
    if (Date.now() > fim) throw new Error("espera: a condição não chegou a tempo");
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("Perfil da Empresa no Google (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let encryption: EncryptionService;
  let dublê: http.Server;
  let tokenDaEquipe: string;
  let operadorId: string;
  let tokenDaDoca: string;
  let docaId: string;
  let tokenDoOutro: string;
  let outroId: string;

  const contas = {
    equipe: { name: "Equipe", email: "equipe@perfil-e2e.local", password: "senha-bem-comprida-1", organizationName: "Perfil E2E Timeless" },
    doca: { name: "Doca", email: "doca@perfil-e2e.local", password: "senha-bem-comprida-2", organizationName: "Perfil E2E Doca" },
    outro: { name: "Outro", email: "outro@perfil-e2e.local", password: "senha-bem-comprida-3", organizationName: "Perfil E2E Outro" },
  };
  const decodifica = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
  const comoEquipe = (r: request.Test) => r.set("Authorization", `Bearer ${tokenDaEquipe}`);

  // O ambiente é do processo inteiro, e as suítes rodam em fila no mesmo processo.
  const variaveis = ["GOOGLE_API_BASE_URL", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "WEB_APP_URL"] as const;
  const anteriores = Object.fromEntries(variaveis.map((nome) => [nome, process.env[nome]]));

  beforeAll(async () => {
    const subido = await sobeDublê();
    dublê = subido.server;
    process.env.GOOGLE_API_BASE_URL = subido.base;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "cliente-teste";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "segredo-teste";
    process.env.WEB_APP_URL = "http://localhost:3300";

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();
    prisma = moduleRef.get(PrismaService);
    encryption = moduleRef.get(EncryptionService);

    await prisma.contaGoogleDaEquipe.deleteMany();
    await prisma.organization.deleteMany({ where: { name: { startsWith: "Perfil E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@perfil-e2e.local" } } });

    const registra = async (conta: object) => (await request(app.getHttpServer()).post("/api/auth/register").send(conta).expect(201)).body.accessToken;
    tokenDaEquipe = await registra(contas.equipe);
    tokenDaDoca = await registra(contas.doca);
    tokenDoOutro = await registra(contas.outro);
    operadorId = decodifica(tokenDaEquipe).sub;
    docaId = decodifica(tokenDaDoca).organizationId;
    outroId = decodifica(tokenDoOutro).organizationId;

    // Operador com segundo fator, direto no banco, como na suíte da administração.
    await prisma.user.update({ where: { id: operadorId }, data: { platformRole: "ADMIN" } });
    await prisma.userMfa.upsert({
      where: { userId: operadorId },
      create: { userId: operadorId, secretEncrypted: encryption.encrypt(geraSegredo()), confirmadoEm: new Date() },
      update: { confirmadoEm: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.contaGoogleDaEquipe.deleteMany();
    await app.close();
    await new Promise((r) => dublê.close(r));
    for (const nome of variaveis) {
      if (anteriores[nome] === undefined) delete process.env[nome];
      else process.env[nome] = anteriores[nome];
    }
  });

  it("é só da equipe: um cliente não chega a nenhuma rota", async () => {
    for (const [metodo, caminho] of [
      ["get", "/api/admin/perfil-da-empresa"],
      ["get", "/api/admin/perfil-da-empresa/locais"],
      ["post", "/api/admin/perfil-da-empresa/inicio"],
      ["get", `/api/admin/organizations/${docaId}/perfil-da-empresa`],
    ] as const) {
      await request(app.getHttpServer())[metodo](caminho).set("Authorization", `Bearer ${tokenDaDoca}`).expect(403);
    }
  });

  it("antes de conectar: configurado, sem conta, e listar perfis pede a conexão", async () => {
    const r = await comoEquipe(request(app.getHttpServer()).get("/api/admin/perfil-da-empresa")).expect(200);
    expect(r.body).toEqual({
      configurado: true,
      enderecoDeRetorno: "http://localhost:3300/clientes/perfil-da-empresa/retorno",
      conta: null,
    });
    const locais = await comoEquipe(request(app.getHttpServer()).get("/api/admin/perfil-da-empresa/locais")).expect(409);
    expect(locais.body.code).toBe("GOOGLE_SEM_CONTA");
  });

  it("o início manda ao consentimento do Google pedindo acesso permanente aos perfis", async () => {
    const r = await comoEquipe(request(app.getHttpServer()).post("/api/admin/perfil-da-empresa/inicio"))
      .send({ volta: `/clientes/${docaId}` })
      .expect(200);
    const url = new URL(r.body.url);
    expect(url.pathname).toBe("/accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "cliente-teste",
      redirect_uri: "http://localhost:3300/clientes/perfil-da-empresa/retorno",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
    });
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/business.manage");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("a volta recusa estado de outra pessoa, código ruim e autorização sem o acesso aos perfis", async () => {
    const conclui = (codigo: string, estado: string) =>
      comoEquipe(request(app.getHttpServer()).post("/api/admin/perfil-da-empresa/conexao")).send({ codigo, estado });

    expect((await conclui("codigo-bom", criaEstado("outra-pessoa", "/clientes")).expect(400)).body.code).toBe("ESTADO_INVALIDO");
    expect((await conclui("codigo-ruim", criaEstado(operadorId, "/clientes")).expect(502)).body.code).toBe("GOOGLE_RECUSOU");
    const semEscopo = await conclui("codigo-sem-escopo", criaEstado(operadorId, "/clientes")).expect(502);
    expect(semEscopo.body.message).toContain("gerenciar o Perfil da Empresa");
    expect(await prisma.contaGoogleDaEquipe.count()).toBe(0);
  });

  it("conecta a conta da equipe e guarda o token de renovação cifrado", async () => {
    const r = await comoEquipe(request(app.getHttpServer()).post("/api/admin/perfil-da-empresa/conexao"))
      .send({ codigo: "codigo-bom", estado: criaEstado(operadorId, `/clientes/${docaId}`) })
      .expect(200);
    expect(r.body).toEqual({ volta: `/clientes/${docaId}`, email: "equipe@timeless.test" });

    const conta = await prisma.contaGoogleDaEquipe.findUniqueOrThrow({ where: { id: "equipe" } });
    expect(conta.refreshTokenEncrypted).not.toContain("renova-da-equipe");
    expect(encryption.decrypt(conta.refreshTokenEncrypted)).toBe("renova-da-equipe");
    expect(conta.conectadaPorId).toBe(operadorId);
  });

  it("lista os perfis de todas as contas, inclusive as de dentro da organização, e conta a que recusou", async () => {
    const r = await comoEquipe(request(app.getHttpServer()).get("/api/admin/perfil-da-empresa/locais")).expect(200);
    expect(r.body).toEqual({
      locais: [
        { localId: "locations/222", nome: "Ateliê Outro", endereco: null, cliente: null },
        { localId: "locations/111", nome: "Doca Centro", endereco: "Rua das Flores, 10, Curitiba - PR", cliente: null },
      ],
      contasRecusadas: 1,
    });
  });

  it("ligar o perfil ao cliente traz o histórico pela fila, sem zero inventado nos dias que o Google ainda não contou", async () => {
    await comoEquipe(request(app.getHttpServer()).put(`/api/admin/organizations/${docaId}/perfil-da-empresa`))
      .send({ locais: ["locations/111"] })
      .expect(204);

    const local = await espera(async () => {
      const achado = await prisma.localDoPerfil.findUnique({ where: { localId: "locations/111" } });
      return achado?.sincronizadoEm ? achado : null;
    }, 30_000);
    expect(local).toMatchObject({ organizationId: docaId, nome: "Doca Centro", erro: null });
    expect(local.numerosAte?.toISOString().slice(0, 10)).toBe(CONTADO_ATE);

    const linhas = await prisma.metricaLocal.findMany({ where: { organizationId: docaId, fonte: "PERFIL_DA_EMPRESA" } });
    const dias = linhas.map((l) => l.dia.toISOString().slice(0, 10)).sort();
    expect(dias.at(-1)).toBe(CONTADO_ATE);
    // O histórico voltou até onde o dublê guarda, e parou no trecho recusado.
    expect(dias[0] <= diaAtras(360)).toBe(true);
    expect(dias[0] >= GUARDADO_DESDE).toBe(true);
    // Dia contado sem ligação é zero de verdade, e vem como linha.
    expect(linhas.some((l) => l.metrica === "LIGACOES" && l.valor === 0)).toBe(true);
    expect(pedidosDeDesempenho.some((busca) => busca.includes("dailyMetrics=CALL_CLICKS"))).toBe(true);
  });

  it("o painel do cliente mostra o perfil até o último dia contado, comparando os mesmos dias do período anterior", async () => {
    const r = await request(app.getHttpServer()).get("/api/presenca-local?days=30").set("Authorization", `Bearer ${tokenDaDoca}`).expect(200);
    const perfil = r.body.perfil;
    const de = diaAtras(29);
    const ateAnterior = somaDias(diaAtras(59), 30 - 4 - 1);
    expect(perfil).toMatchObject({
      locais: [{ nome: "Doca Centro", numerosAte: CONTADO_ATE }],
      numerosAte: CONTADO_ATE,
      lendo: false,
      comProblema: false,
      periodo: { de, ate: CONTADO_ATE },
      periodoAnterior: { de: diaAtras(59), ate: ateAnterior },
    });
    expect(perfil.totais.LIGACOES).toEqual({
      atual: somaNoDublê(["CALL_CLICKS"], de, CONTADO_ATE),
      anterior: somaNoDublê(["CALL_CLICKS"], diaAtras(59), ateAnterior),
    });
    expect(perfil.totais.ROTAS.atual).toBe(somaNoDublê(["BUSINESS_DIRECTION_REQUESTS"], de, CONTADO_ATE));
    expect(perfil.totais.VISUALIZACOES.atual).toBe(
      somaNoDublê(
        ["BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"],
        de,
        CONTADO_ATE,
      ),
    );
    expect(perfil.totais.CONVERSAS).toEqual({ atual: 0, anterior: 0 });
    expect(perfil.serie).toHaveLength(26);

    // Os números do perfil não entram nos dos anúncios.
    expect(r.body.totais.ROTAS.atual).toBeNull();
  });

  it("o mesmo perfil não pode ser de dois clientes, nem um id que a conta não enxerga", async () => {
    const outro = await comoEquipe(request(app.getHttpServer()).put(`/api/admin/organizations/${outroId}/perfil-da-empresa`))
      .send({ locais: ["locations/111"] })
      .expect(409);
    expect(outro.body.code).toBe("LOCAL_DE_OUTRO_CLIENTE");
    expect(outro.body.message).toContain("Perfil E2E Doca");

    const desconhecido = await comoEquipe(request(app.getHttpServer()).put(`/api/admin/organizations/${outroId}/perfil-da-empresa`))
      .send({ locais: ["locations/999"] })
      .expect(400);
    expect(desconhecido.body.code).toBe("LOCAL_DESCONHECIDO");

    await comoEquipe(request(app.getHttpServer()).put(`/api/admin/organizations/${outroId}/perfil-da-empresa`))
      .send({ locais: ["../locations/111"] })
      .expect(400);

    const doOutro = await request(app.getHttpServer()).get("/api/presenca-local?days=30").set("Authorization", `Bearer ${tokenDoOutro}`).expect(200);
    expect(doOutro.body.perfil).toBeNull();
  });

  it("a lista da equipe diz de qual cliente cada perfil já é", async () => {
    const r = await comoEquipe(request(app.getHttpServer()).get("/api/admin/perfil-da-empresa/locais")).expect(200);
    expect(r.body.locais.find((l: { localId: string }) => l.localId === "locations/111").cliente).toEqual({ id: docaId, nome: "Perfil E2E Doca" });

    const doCliente = await comoEquipe(request(app.getHttpServer()).get(`/api/admin/organizations/${docaId}/perfil-da-empresa`)).expect(200);
    expect(doCliente.body.locais).toEqual([
      expect.objectContaining({ localId: "locations/111", nome: "Doca Centro", numerosAte: CONTADO_ATE, erro: null }),
    ]);
  });

  it("com o acesso perdido, a leitura para e diz por quê, sem apagar o que já chegou", async () => {
    const conta = await prisma.contaGoogleDaEquipe.findUniqueOrThrow({ where: { id: "equipe" } });
    await prisma.contaGoogleDaEquipe.update({ where: { id: "equipe" }, data: { refreshTokenEncrypted: encryption.encrypt("revogado") } });
    app.get(AcessoAoGoogle).esqueceAcesso();
    const antes = await prisma.metricaLocal.count({ where: { organizationId: docaId, fonte: "PERFIL_DA_EMPRESA" } });

    await comoEquipe(request(app.getHttpServer()).post(`/api/admin/organizations/${docaId}/perfil-da-empresa/ler`)).expect(202);
    const local = await espera(async () => {
      const achado = await prisma.localDoPerfil.findUnique({ where: { localId: "locations/111" } });
      return achado?.erro ? achado : null;
    });
    expect(local.erro).toContain("perdeu o acesso");

    const situacao = await comoEquipe(request(app.getHttpServer()).get("/api/admin/perfil-da-empresa")).expect(200);
    expect(situacao.body.conta.erro).toContain("Token has been expired or revoked");
    expect(await prisma.metricaLocal.count({ where: { organizationId: docaId, fonte: "PERFIL_DA_EMPRESA" } })).toBe(antes);

    const painel = await request(app.getHttpServer()).get("/api/presenca-local?days=30").set("Authorization", `Bearer ${tokenDaDoca}`).expect(200);
    expect(painel.body.perfil.comProblema).toBe(true);
    expect(JSON.stringify(painel.body)).not.toContain("Token has been");

    await prisma.contaGoogleDaEquipe.update({ where: { id: "equipe" }, data: { refreshTokenEncrypted: conta.refreshTokenEncrypted, erro: null } });
  });

  it("tirar o perfil do cliente leva os números junto", async () => {
    await comoEquipe(request(app.getHttpServer()).put(`/api/admin/organizations/${docaId}/perfil-da-empresa`)).send({ locais: [] }).expect(204);
    expect(await prisma.metricaLocal.count({ where: { organizationId: docaId, fonte: "PERFIL_DA_EMPRESA" } })).toBe(0);
    const painel = await request(app.getHttpServer()).get("/api/presenca-local?days=30").set("Authorization", `Bearer ${tokenDaDoca}`).expect(200);
    expect(painel.body.perfil).toBeNull();
  });

  it("desligar a conta da equipe avisa o Google e apaga o token", async () => {
    const antes = revogados;
    await comoEquipe(request(app.getHttpServer()).delete("/api/admin/perfil-da-empresa")).expect(204);
    expect(revogados).toBe(antes + 1);
    expect(await prisma.contaGoogleDaEquipe.count()).toBe(0);
  });
});
