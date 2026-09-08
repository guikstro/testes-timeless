import "./test-env";
import { INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { TETO_DE_CONVERSAS } from "../src/conversations/caixa-de-entrada";

/**
 * A caixa de entrada, contra Postgres de verdade.
 *
 * Existe porque a regra de "o que está pendente" saiu de uma função pura e foi
 * para o SQL. Ela precisava sair: enquanto era calculada em memória, o filtro
 * rodava depois do corte de duzentas conversas, e como quem espera há mais
 * tempo tem, por definição, a atividade mais antiga, o filtro que existe para
 * achar os leads abandonados era exatamente o que os escondia.
 *
 * Com dublê de banco isto não se prova. Um teste que finge o Postgres só
 * confirmaria que a string escrita é a string escrita.
 */
describe("Caixa de entrada (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let organizationId: string;

  const MARCA = "Caixa E2E";
  const AGORA = Date.now();
  const DIA = 24 * 60 * 60 * 1000;

  /** Mais conversas do que o teto, para o corte ter de fato que acontecer. */
  const RESPONDIDAS = TETO_DE_CONVERSAS + 5;
  const ABANDONADAS = 5;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api", { exclude: ["health", { path: "r/:code", method: RequestMethod.GET }] });
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await limpar();

    const cadastro = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "Operadora",
      email: "operadora@caixa-e2e.local",
      password: "password123",
      organizationName: `${MARCA} Org`,
    });
    token = cadastro.body.accessToken;
    organizationId = await idDaOrganizacao(`${MARCA} Org`);

    const conexao = await prisma.whatsAppConnection.create({
      data: { organizationId, provider: "CLOUD_API", phoneNumberId: `caixa-e2e-${Date.now()}` },
    });

    /*
      Duzentas e cinco conversas respondidas e recentes, que sozinhas já
      enchem a janela do corte, mais cinco abandonadas há muito tempo. Sob a
      regra antiga, as cinco eram invisíveis: elas ficam no fim de qualquer
      ordenação por atividade recente.

      Semeadas em lote. Uma escrita por conversa levava minutos, e um teste
      que ninguém tem paciência de rodar não protege nada.
    */
    const roteiros = [
      ...Array.from({ length: RESPONDIDAS }, (_, i) => ({
        apelido: `respondida-${i}`,
        mensagens: [
          { direction: "INBOUND" as const, em: new Date(AGORA - 2 * 60 * 60 * 1000) },
          { direction: "OUTBOUND" as const, em: new Date(AGORA - 60 * 60 * 1000) },
        ],
      })),
      ...Array.from({ length: ABANDONADAS }, (_, i) => ({
        apelido: `abandonada-${i}`,
        // Uma mais velha que a outra, para a ordem poder ser conferida.
        mensagens: [{ direction: "INBOUND" as const, em: new Date(AGORA - (30 + i * 10) * DIA) }],
      })),
    ];

    await semear(conexao.id, roteiros);
  }, 180_000);

  afterAll(async () => {
    await limpar();
    await app.close();
  });

  async function idDaOrganizacao(nome: string): Promise<string> {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    return org.id;
  }

  /**
   * Contador de telefones, compartilhado entre as chamadas.
   *
   * O número precisa ser único dentro da organização. Derivar do índice do
   * lote fazia a segunda chamada repetir os números da primeira e esbarrar na
   * restrição.
   */
  let proximoTelefone = 90000000;

  interface Roteiro {
    apelido: string;
    mensagens: { direction: "INBOUND" | "OUTBOUND"; em: Date }[];
  }

  /** Cria leads, conversas e mensagens em três escritas, não em três por conversa. */
  async function semear(whatsappConnectionId: string, roteiros: Roteiro[]) {
    const leads = roteiros.map((r, i) => ({
      id: randomUUID(),
      organizationId,
      name: `${MARCA} ${r.apelido}`,
      normalizedPhone: `5585${proximoTelefone + i}`,
      rawPhone: r.apelido,
      firstContactAt: r.mensagens[0].em,
      lastContactAt: r.mensagens[r.mensagens.length - 1].em,
    }));

    const conversas = roteiros.map((r, i) => ({
      id: randomUUID(),
      organizationId,
      leadId: leads[i].id,
      whatsappConnectionId,
      startedAt: r.mensagens[0].em,
      lastMessageAt: r.mensagens[r.mensagens.length - 1].em,
    }));

    const mensagens = roteiros.flatMap((r, i) =>
      r.mensagens.map((m, j) => ({
        conversationId: conversas[i].id,
        externalId: `caixa-e2e-${r.apelido}-${j}-${randomUUID()}`,
        direction: m.direction,
        type: "TEXT" as const,
        text: m.direction === "INBOUND" ? "Oi, tem alguém aí?" : "Já respondo",
        timestamp: m.em,
        ...(m.direction === "OUTBOUND" ? { outboundStatus: "SENT" as const } : {}),
      })),
    );

    proximoTelefone += roteiros.length;

    await prisma.lead.createMany({ data: leads });
    await prisma.conversation.createMany({ data: conversas });
    await prisma.message.createMany({ data: mensagens });
  }

  async function limpar() {
    await prisma.message.deleteMany({ where: { conversation: { organization: { name: { contains: MARCA } } } } });
    await prisma.conversation.deleteMany({ where: { organization: { name: { contains: MARCA } } } });
    await prisma.leadEvent.deleteMany({ where: { lead: { organization: { name: { contains: MARCA } } } } });
    await prisma.lead.deleteMany({ where: { organization: { name: { contains: MARCA } } } });
    await prisma.whatsAppConnection.deleteMany({ where: { organization: { name: { contains: MARCA } } } });
    await prisma.membership.deleteMany({ where: { organization: { name: { contains: MARCA } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "caixa-e2e" } } });
    await prisma.organization.deleteMany({ where: { name: { contains: MARCA } } });
  }

  function caixa(query = "") {
    return request(app.getHttpServer())
      .get(`/api/conversations${query}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  }

  it("encontra as abandonadas mesmo estando além do teto da lista", async () => {
    const { body } = await caixa("?status=awaiting");

    const nomes = body.conversations.map((c: { lead: { name: string } }) => c.lead.name);
    expect(nomes).toHaveLength(ABANDONADAS);
    for (let i = 0; i < ABANDONADAS; i++) {
      expect(nomes).toContain(`${MARCA} abandonada-${i}`);
    }
  });

  it("põe quem espera há mais tempo em primeiro", async () => {
    const { body } = await caixa("?status=awaiting");

    const esperas = body.conversations.map((c: { esperandoHaSegundos: number }) => c.esperandoHaSegundos);
    // Quando a pergunta é "quem eu deixei esperando", listar por atividade
    // recente responde o contrário do que se quer saber.
    expect([...esperas].sort((a, b) => b - a)).toEqual(esperas);
    expect(esperas[0]).toBeGreaterThan(esperas[esperas.length - 1]);
  });

  it("não chama de pendente quem já foi respondido", async () => {
    const { body } = await caixa("?status=unread");

    const nomes: string[] = body.conversations.map((c: { lead: { name: string } }) => c.lead.name);
    // As respondidas terminam com mensagem nossa: mensagem do lead anterior à
    // nossa resposta não conta como não lida.
    expect(nomes.every((n) => n.includes("abandonada"))).toBe(true);
  });

  it("conta como não respondidas só as mensagens depois da nossa última", async () => {
    const conexao = await prisma.whatsAppConnection.findFirstOrThrow({ where: { organizationId } });
    await semear(conexao.id, [
      {
        apelido: "com-historico",
        mensagens: [
          { direction: "INBOUND", em: new Date(AGORA - 5 * DIA) },
          { direction: "OUTBOUND", em: new Date(AGORA - 4 * DIA) },
          { direction: "INBOUND", em: new Date(AGORA - 3 * DIA) },
          { direction: "INBOUND", em: new Date(AGORA - 2 * DIA) },
        ],
      },
    ]);

    const { body } = await caixa("?status=awaiting");
    const item = body.conversations.find((c: { lead: { name: string } }) =>
      c.lead.name.includes("com-historico"),
    );

    // Quatro mensagens no histórico, duas depois da nossa resposta.
    expect(item.unreadCount).toBe(2);
    // E a espera conta desde a primeira sem resposta, não desde a última.
    expect(item.esperandoHaSegundos).toBeGreaterThan(2.5 * 24 * 60 * 60);
  });

  it("corta a lista no teto e diz que cortou", async () => {
    const { body } = await caixa();

    expect(body.conversations).toHaveLength(TETO_DE_CONVERSAS);
    // Sem este aviso, "não encontrei" e "não procurei além daqui" viram a
    // mesma frase para quem lê a tela.
    expect(body.truncado).toBe(true);
  });

  it("nunca alcança a caixa de outra organização", async () => {
    const outra = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "Alheia",
      email: "alheia@caixa-e2e.local",
      password: "password123",
      organizationName: `${MARCA} Org Alheia`,
    });

    const { body } = await request(app.getHttpServer())
      .get("/api/conversations")
      .set("Authorization", `Bearer ${outra.body.accessToken}`)
      .expect(200);

    expect(body.conversations).toHaveLength(0);
  });
});
