import "./test-env";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

function lerToken(token: string): { sub: string; organizationId: string } {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
}

interface Resposta {
  totalNoPeriodo: number;
  filtros: { campanha: string | null; origem: string | null; responsavel: string | null };
  funil: {
    etapas: { chave: string; quantidade: number; perdidos: number; abertos: number }[];
    conversaoTotal: number | null;
    motivosDePerda: { motivo: string | null; quantidade: number }[];
  };
  opcoes: {
    campanhas: { valor: string; rotulo: string; leads: number }[];
    origens: { valor: string; rotulo: string; leads: number }[];
    responsaveis: { id: string; name: string }[];
  };
}

/**
 * O funil da aba Funil com o banco de verdade.
 *
 * O que os testes de unidade não alcançam: a subida do anúncio para a
 * campanha pelas linhas sincronizadas, a resposta da equipe no WhatsApp como
 * prova de contato, e a validação dos recortes que chegam pela URL.
 */
describe("Funil com recortes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let orgId: string;
  let eu: string;
  const agora = new Date();

  let contador = 0;
  async function criaLead(dados: Partial<Prisma.LeadUncheckedCreateInput> = {}, evidencia?: Record<string, string>) {
    contador += 1;
    const telefone = `5585988${String(contador).padStart(6, "0")}`;
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        normalizedPhone: `+${telefone}`,
        rawPhone: telefone,
        firstContactAt: agora,
        lastContactAt: agora,
        ...dados,
      },
    });
    if (evidencia) {
      await prisma.attribution.create({
        data: {
          organizationId: orgId,
          leadId: lead.id,
          method: "CTWA_REFERRAL",
          confidence: "HIGH",
          evidence: { ctwaClid: `clid-${contador}`, ...evidencia },
        },
      });
    }
    return lead;
  }

  async function funil(consulta = "", status = 200): Promise<Resposta> {
    const resposta = await request(app.getHttpServer())
      .get(`/api/analytics/funil?days=30${consulta}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(status);
    return resposta.body as Resposta;
  }

  const quantidades = (resposta: Resposta) => resposta.funil.etapas.map((etapa) => etapa.quantidade);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.organization.deleteMany({ where: { name: { contains: "Funil E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "funil-e2e" } } });

    const conta = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@funil-e2e.local", password: "password123", organizationName: "Funil E2E Org" })
      .expect(201);
    token = conta.body.accessToken;
    ({ sub: eu, organizationId: orgId } = lerToken(token));

    const outra = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: "Outra", email: "outra@funil-e2e.local", password: "password123", organizationName: "Funil E2E Outra" })
      .expect(201);
    const orgOutra = lerToken(outra.body.accessToken).organizationId;

    // A campanha da conta, com o anúncio que o Click-to-WhatsApp aponta.
    const campanha = await prisma.campaign.create({
      data: { organizationId: orgId, externalId: "cmp-111", name: "Black Friday", status: "ACTIVE", lastSyncedAt: agora },
    });
    const conjunto = await prisma.adSet.create({
      data: { campaignId: campanha.id, externalId: "set-1", name: "Conjunto", status: "ACTIVE", lastSyncedAt: agora },
    });
    await prisma.ad.create({
      data: { adSetId: conjunto.id, externalId: "ad-1", name: "Anúncio", status: "ACTIVE", lastSyncedAt: agora },
    });

    // Um id de campanha que só existe na outra conta, e aparece na evidência de um lead daqui.
    await prisma.campaign.create({
      data: { organizationId: orgOutra, externalId: "cmp-999", name: "Nome da Outra Conta", status: "ACTIVE", lastSyncedAt: agora },
    });

    // 1. Novo, sem resposta.
    await criaLead();

    // 2. Novo, mas a equipe já respondeu: foi contatado, só não trocou de estágio.
    const respondido = await criaLead();
    const whatsapp = await prisma.whatsAppConnection.create({
      data: { organizationId: orgId, provider: "CLOUD_API", phoneNumberId: `funil-e2e-${Date.now()}` },
    });
    const conversa = await prisma.conversation.create({
      data: { organizationId: orgId, leadId: respondido.id, whatsappConnectionId: whatsapp.id },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conversa.id, direction: "INBOUND", type: "TEXT", text: "Oi", timestamp: new Date(agora.getTime() - 120_000) },
        {
          conversationId: conversa.id,
          direction: "OUTBOUND",
          type: "TEXT",
          text: "Olá!",
          timestamp: new Date(agora.getTime() - 60_000),
          outboundStatus: "SENT",
        },
      ],
    });

    // 3. Em atendimento, do anúncio, da Ana.
    await criaLead({ status: "IN_PROGRESS", emAtendimentoAt: agora, responsavelId: eu }, { adId: "ad-1" });
    // 4. Qualificado e perdido por preço, do anúncio, sem responsável.
    await criaLead({ status: "QUALIFIED", disqualifiedAt: agora, disqualifiedReason: "Preço" }, { adId: "ad-1" });
    // 5. Reunião marcada, da Ana, sem origem.
    await criaLead({ status: "MEETING_SCHEDULED", meetingScheduledAt: agora, responsavelId: eu });
    // 6. Venda, do anúncio, da Ana.
    await criaLead({ status: "WON", wonAt: agora, responsavelId: eu }, { adId: "ad-1" });
    // 7. Novo, com o id da campanha da outra conta na evidência.
    await criaLead({}, { campaignId: "cmp-999" });

    // Fora do período e de outra conta: nenhum dos dois pode contar.
    await criaLead({ status: "WON", firstContactAt: new Date(agora.getTime() - 45 * 86_400_000) });
    await prisma.lead.create({
      data: {
        organizationId: orgOutra,
        normalizedPhone: "+5585977770000",
        rawPhone: "5585977770000",
        status: "WON",
        firstContactAt: agora,
        lastContactAt: agora,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("conta em cada etapa quem chegou nela ou além, e a resposta da equipe prova o contato", async () => {
    const resposta = await funil();

    expect(resposta.totalNoPeriodo).toBe(7);
    expect(resposta.funil.etapas.map((etapa) => etapa.chave)).toEqual([
      "leads",
      "contatados",
      "qualificados",
      "reuniao",
      "vendas",
    ]);
    expect(quantidades(resposta)).toEqual([7, 5, 3, 2, 1]);
    expect(resposta.funil.conversaoTotal).toBeCloseTo(1 / 7);
  });

  it("separa quem parou em cada etapa entre perdidos e abertos, com o motivo da perda", async () => {
    const { funil: montado } = await funil();

    expect(montado.etapas.map((etapa) => [etapa.perdidos, etapa.abertos])).toEqual([
      [0, 2],
      [0, 2],
      [1, 0],
      [0, 1],
      [0, 0],
    ]);
    expect(montado.motivosDePerda).toEqual([{ motivo: "Preço", quantidade: 1 }]);
  });

  it("recorta pela campanha do anúncio, que a Meta não manda no Click-to-WhatsApp", async () => {
    const resposta = await funil("&campanha=cmp-111");

    expect(quantidades(resposta)).toEqual([3, 3, 2, 1, 1]);
    // O total do período continua o mesmo: é ele que diz "3 dos 7".
    expect(resposta.totalNoPeriodo).toBe(7);
    expect(resposta.filtros).toEqual({ campanha: "cmp-111", origem: null, responsavel: null });
    expect(resposta.opcoes.campanhas).toContainEqual({ valor: "cmp-111", rotulo: "Black Friday", leads: 3 });
  });

  it("mostra a campanha de outra conta pelo id, nunca pelo nome dela", async () => {
    const resposta = await funil("&campanha=cmp-999");

    expect(quantidades(resposta)).toEqual([1, 0, 0, 0, 0]);
    expect(resposta.opcoes.campanhas).toContainEqual({ valor: "cmp-999", rotulo: "Campanha cmp-999", leads: 1 });
    expect(JSON.stringify(resposta)).not.toContain("Nome da Outra Conta");
  });

  it("recorta os leads sem campanha", async () => {
    // Os leads 1, 2 e 5 não têm atribuição nenhuma.
    expect(quantidades(await funil("&campanha=nenhuma"))).toEqual([3, 2, 1, 1, 0]);
  });

  it("recorta por origem", async () => {
    // Os quatro leads de Click-to-WhatsApp: 3, 4, 6 e 7.
    expect(quantidades(await funil("&origem=meta_ctwa"))).toEqual([4, 3, 2, 1, 1]);
  });

  it("recorta por responsável, por falta dele e por quem pergunta", async () => {
    expect(quantidades(await funil(`&responsavel=${eu}`))).toEqual([3, 3, 2, 2, 1]);
    expect(quantidades(await funil("&responsavel=eu"))).toEqual([3, 3, 2, 2, 1]);
    expect(quantidades(await funil("&responsavel=nenhum"))).toEqual([4, 2, 1, 0, 0]);

    const resposta = await funil("&responsavel=eu");
    // "eu" volta como "eu": é o que a tela marca na lista.
    expect(resposta.filtros.responsavel).toBe("eu");
    expect(resposta.opcoes.responsaveis).toEqual([{ id: eu, name: "Ana" }]);
  });

  it("soma os recortes", async () => {
    expect(quantidades(await funil("&campanha=cmp-111&responsavel=eu"))).toEqual([2, 2, 1, 1, 1]);
  });

  it("recusa recorte que não existe", async () => {
    await funil("&responsavel=qualquer", 400);
    await funil(`&campanha=${"x".repeat(201)}`, 400);
    await funil("&outro=1", 400);
    await request(app.getHttpServer()).get("/api/analytics/funil?days=0").set("Authorization", `Bearer ${token}`).expect(400);
  });
});
