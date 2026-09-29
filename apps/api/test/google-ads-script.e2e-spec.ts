import "./test-env";
import Redis from "ioredis";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Google Ads pelo script, de ponta a ponta: gerar o script, mandar um envio
 * como o Google mandaria, e ver os números na tela. E o que não pode
 * acontecer: chave errada escrevendo, a mesma chave misturando duas contas,
 * e um cliente enxergando as campanhas do outro.
 */
describe("Google Ads por script (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let chaveA: string;

  const contas = [
    { name: "Ana GAds", email: "ana@gads-e2e.local", password: "senha-bem-comprida-a", organizationName: "Org GAds A" },
    { name: "Beto GAds", email: "beto@gads-e2e.local", password: "senha-bem-comprida-b", organizationName: "Org GAds B" },
  ];

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const envio = (conta = "1234567890") => ({
    conta: { id: conta, nome: "Clínica Sorriso", moeda: "BRL" },
    campanhas: [
      {
        id: "20001",
        nome: "Busca | Implante",
        status: "ENABLED",
        orcamentoMicros: 80_000_000,
        dias: [{ data: hoje, custoMicros: 45_670_000, impressoes: 1200, cliques: 84, conversoes: 3.5, valorConversoes: 0 }],
      },
      {
        id: "20002",
        nome: "PMax | Clareamento",
        status: "PAUSED",
        orcamentoMicros: null,
        dias: [{ data: hoje, custoMicros: 0, impressoes: 0, cliques: 0, conversoes: 0, valorConversoes: 0 }],
      },
    ],
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await prisma.organization.deleteMany({ where: { name: { in: contas.map((c) => c.organizationName) } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@gads-e2e.local" } } });
    const cliente = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/1");
    cliente.on("error", () => undefined);
    const chaves = await cliente.keys("throttle:*");
    if (chaves.length > 0) await cliente.del(...chaves);
    await cliente.quit().catch(() => undefined);

    tokenA = (await request(app.getHttpServer()).post("/api/auth/register").send(contas[0]).expect(201)).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post("/api/auth/register").send(contas[1]).expect(201)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const manda = (chave: string | null, corpo: object) => {
    const r = request(app.getHttpServer()).post("/api/publico/google-ads/envio");
    return (chave ? r.set("X-Chave-Timeless", chave) : r).send(corpo);
  };

  it("gera o script com a chave dentro, e a chave não fica guardada em texto", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/api/integrations/google/script")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(201);

    const achada = /var CHAVE = "(tml_gads_[A-Za-z0-9_-]+)"/.exec(resposta.body.script);
    expect(achada).not.toBeNull();
    chaveA = achada![1];
    expect(resposta.body.script).toContain("/api/publico/google-ads/envio");

    const linhas = await prisma.googleAdsConexao.findMany();
    expect(JSON.stringify(linhas)).not.toContain(chaveA);
  });

  it("recebe o envio e mostra gasto, cliques, impressões e conversões de cada campanha", async () => {
    const resposta = await manda(chaveA, envio()).expect(200);
    expect(resposta.body).toMatchObject({ recebido: true, campanhas: 2, dias: 2 });

    const tela = await request(app.getHttpServer())
      .get("/api/integrations/google/script")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(tela.body.conexao).toMatchObject({ conta: "123-456-7890", nomeDaConta: "Clínica Sorriso", moeda: "BRL" });
    const busca = tela.body.campanhas.find((c: { idNaPlataforma: string }) => c.idNaPlataforma === "20001");
    expect(busca).toMatchObject({
      nome: "Busca | Implante",
      status: "ACTIVE",
      gastoCentavos: 4567,
      impressoes: 1200,
      cliques: 84,
      conversoes: 3.5,
      orcamentoDiarioCentavos: 8000,
    });
  });

  it("reenviar o mesmo dia substitui, e não soma", async () => {
    await manda(chaveA, envio()).expect(200);
    const tela = await request(app.getHttpServer())
      .get("/api/integrations/google/script")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    const busca = tela.body.campanhas.find((c: { idNaPlataforma: string }) => c.idNaPlataforma === "20001");
    expect(busca.gastoCentavos).toBe(4567);
  });

  describe("presença local: ligações e rotas", () => {
    const painel = async (token = tokenA) =>
      (await request(app.getHttpServer()).get("/api/presenca-local?days=7").set("Authorization", `Bearer ${token}`).expect(200)).body;
    const local = (metrica: string, valor: number) => ({ campanha: "20001", data: hoje, metrica, valor });

    it("script antigo: a tela pede o novo, e o painel diz que ligação e rota não estão sendo medidas", async () => {
      const tela = await request(app.getHttpServer())
        .get("/api/integrations/google/script")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);
      expect(tela.body.conexao.scriptDesatualizado).toBe(true);

      const p = await painel();
      expect(p.situacao).toBe("script-desatualizado");
      expect(p.totais.ROTAS.atual).toBeNull();
      expect(p.investimento.atual).toBe(4567);
      expect(p.custo.porRota.atual).toBeNull();
    });

    it("script novo: soma ligações e rotas e calcula o custo de cada uma", async () => {
      await manda(chaveA, {
        ...envio(),
        versao: 2,
        partes: { ligacoes: "ok", acoesLocais: "ok" },
        locais: [local("LIGACOES_DOS_ANUNCIOS", 3), local("ROTAS", 7), local("LIGACOES_CONVERSAO", 2)],
      }).expect(200);

      const p = await painel();
      expect(p.situacao).toBe("medido");
      expect(p.totais.LIGACOES_DOS_ANUNCIOS.atual).toBe(3);
      expect(p.totais.ROTAS.atual).toBe(7);
      // Medido e sem nenhuma: zero, e não "sem medida".
      expect(p.totais.VISITAS_A_LOJA.atual).toBe(0);
      expect(p.custo.porLigacao.atual).toBe(1522);
      expect(p.custo.porRota.atual).toBe(652);
      expect(p.serie.find((d: { dia: string }) => d.dia === hoje)).toMatchObject({ ligacoes: 3, rotas: 7 });
      expect(p.campanhas[0]).toMatchObject({ nome: "Busca | Implante", ligacoes: 3, rotas: 7 });

      const tela = await request(app.getHttpServer())
        .get("/api/integrations/google/script")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);
      expect(tela.body.conexao.scriptDesatualizado).toBe(false);
    });

    it("parte que falhou não apaga o que já estava, e aparece como sem medida", async () => {
      await manda(chaveA, {
        ...envio(),
        versao: 2,
        partes: { ligacoes: "ok", acoesLocais: "falhou: consulta recusada" },
        locais: [local("LIGACOES_DOS_ANUNCIOS", 5)],
      }).expect(200);

      const p = await painel();
      expect(p.situacao).toBe("parcial");
      expect(p.totais.LIGACOES_DOS_ANUNCIOS.atual).toBe(5);
      expect(p.totais.ROTAS.atual).toBeNull();
      expect(await prisma.metricaLocal.count({ where: { metrica: "ROTAS", organization: { name: "Org GAds A" } } })).toBe(1);
    });

    it("o outro cliente não vê as ligações de A", async () => {
      const p = await painel(tokenB);
      expect(p.situacao).toBe("sem-google-ads");
      expect(p.totais.LIGACOES_DOS_ANUNCIOS.atual).toBeNull();
      expect(p.campanhas).toEqual([]);
    });

    it("a sessão diz o foco do cliente; o padrão é leads", async () => {
      const sessao = await request(app.getHttpServer()).get("/api/auth/session").set("Authorization", `Bearer ${tokenA}`).expect(200);
      expect(sessao.body.organization.foco).toBe("LEADS");
    });
  });

  it("recusa envio sem chave ou com chave errada, e não grava nada", async () => {
    const antes = await prisma.adSpend.count();
    await manda(null, envio()).expect(401);
    await manda("tml_gads_inventada", envio()).expect(401);
    expect(await prisma.adSpend.count()).toBe(antes);
  });

  it("recusa a mesma chave vinda de outra conta do Google Ads", async () => {
    const resposta = await manda(chaveA, envio("9999999999")).expect(409);
    expect(resposta.body.code).toBe("OUTRA_CONTA");
  });

  it("recusa um corpo fora do formato", async () => {
    await manda(chaveA, { conta: { id: "abc", nome: "x", moeda: "BRL" }, campanhas: [] }).expect(400);
    await manda(chaveA, { ...envio(), extra: "campo a mais" }).expect(400);
  });

  it("o outro cliente não vê as campanhas do Google de A", async () => {
    const tela = await request(app.getHttpServer())
      .get("/api/integrations/google/script")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    expect(tela.body.conexao).toBeNull();
    expect(JSON.stringify(tela.body)).not.toContain("Implante");
  });

  it("gerar um script novo invalida a chave antiga", async () => {
    await request(app.getHttpServer())
      .post("/api/integrations/google/script")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(201);
    await manda(chaveA, envio()).expect(401);
  });
});
