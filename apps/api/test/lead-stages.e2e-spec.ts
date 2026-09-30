import "./test-env";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

function decodeJwtOrganizationId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString("utf8")) as {
    organizationId: string;
  };
  return payload.organizationId;
}

/**
 * Cobre a camada que os testes de unidade não alcançam: validação do DTO,
 * persistência real das colunas novas e o efeito no dashboard.
 */
describe("Estágio de reunião e desqualificação (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.organization.deleteMany({ where: { name: { contains: "Lead Stages E2E" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "lead-stages-e2e" } } });

    const registered = await request(app.getHttpServer()).post("/api/auth/register").send({
      name: "User",
      email: "user@lead-stages-e2e.local",
      password: "password123",
      organizationName: "Lead Stages E2E Org",
    });
    token = registered.body.accessToken;
    orgId = decodeJwtOrganizationId(token);
  });

  afterAll(async () => {
    await app.close();
  });

  let counter = 0;
  async function createLead() {
    counter += 1;
    return prisma.lead.create({
      data: {
        organizationId: orgId,
        normalizedPhone: `+5585900${String(counter).padStart(5, "0")}`,
        rawPhone: `5585900${String(counter).padStart(5, "0")}`,
        firstContactAt: new Date(),
        lastContactAt: new Date(),
      },
    });
  }

  function patch(leadId: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/leads/${leadId}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  it("marca reunião e persiste a data", async () => {
    const lead = await createLead();

    await patch(lead.id, { status: "MEETING_SCHEDULED" }).expect(200);

    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.status).toBe("MEETING_SCHEDULED");
    expect(saved.meetingScheduledAt).toBeInstanceOf(Date);
    // Combinar horário pressupõe ter qualificado.
    expect(saved.qualifiedAt).toBeInstanceOf(Date);
  });

  /** Vender sem reunião é comum — inventar uma falsearia o funil de reuniões. */
  it("não inventa reunião ao marcar venda", async () => {
    const lead = await createLead();

    await patch(lead.id, { status: "WON", revenueCents: 50000 }).expect(200);

    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.status).toBe("WON");
    expect(saved.meetingScheduledAt).toBeNull();
  });

  it("desqualifica preservando o estágio a que o lead chegou", async () => {
    const lead = await createLead();
    await patch(lead.id, { status: "QUALIFIED" }).expect(200);

    await patch(lead.id, { disqualified: true, disqualifiedReason: "Sem verba" }).expect(200);

    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.disqualifiedAt).toBeInstanceOf(Date);
    expect(saved.disqualifiedReason).toBe("Sem verba");
    // Saída lateral: o estágio permanece.
    expect(saved.status).toBe("QUALIFIED");
  });

  it("recusa desqualificar quem já comprou", async () => {
    const lead = await createLead();
    await patch(lead.id, { status: "WON" }).expect(200);

    const response = await patch(lead.id, { disqualified: true }).expect(400);
    expect(response.body.code).toBe("CANNOT_DISQUALIFY_WON");
  });

  it("reativa ao avançar o funil, sem exigir dois passos", async () => {
    const lead = await createLead();
    await patch(lead.id, { disqualified: true, disqualifiedReason: "Engano" }).expect(200);

    await patch(lead.id, { status: "QUALIFIED" }).expect(200);

    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.disqualifiedAt).toBeNull();
    expect(saved.disqualifiedReason).toBeNull();
    expect(saved.status).toBe("QUALIFIED");
  });

  it("rejeita um status que não existe", async () => {
    const lead = await createLead();

    await patch(lead.id, { status: "REUNIAO" }).expect(400);
  });

  it("rejeita um motivo maior que o limite", async () => {
    const lead = await createLead();

    await patch(lead.id, { disqualified: true, disqualifiedReason: "x".repeat(201) }).expect(400);
  });

  /** O ponto de existir a desqualificação: tirar do denominador quem nunca foi oportunidade. */
  it("tira os desqualificados do denominador no dashboard", async () => {
    const qualified = await createLead();
    await patch(qualified.id, { status: "QUALIFIED" }).expect(200);
    await createLead();
    const discarded = await createLead();
    await patch(discarded.id, { disqualified: true }).expect(200);

    const response = await request(app.getHttpServer())
      .get("/api/analytics/overview?days=30")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const { totals } = response.body;
    expect(totals.disqualified).toBeGreaterThanOrEqual(1);
    expect(totals.workable).toBe(totals.leads - totals.disqualified);
    // A taxa é sobre os aproveitáveis, nunca sobre o total.
    expect(totals.qualificationRate).toBeCloseTo(totals.qualified / totals.workable);
  });

  describe("acompanhamento: em atendimento, responsável, valor e próxima ação", () => {
    const eu = () => JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8")).sub as string;

    async function totais() {
      const resposta = await request(app.getHttpServer())
        .get("/api/analytics/overview?days=30")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      return resposta.body.totals as { leads: number; qualified: number };
    }

    it("marca em atendimento à mão, e isso não conta como qualificado", async () => {
      const antes = await totais();
      const lead = await createLead();

      await patch(lead.id, { status: "IN_PROGRESS" }).expect(200);

      const salvo = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(salvo.status).toBe("IN_PROGRESS");
      expect(salvo.emAtendimentoAt).toBeInstanceOf(Date);
      const depois = await totais();
      expect(depois.leads).toBe(antes.leads + 1);
      expect(depois.qualified).toBe(antes.qualified);

      // Dali, qualifica; e não volta.
      await patch(lead.id, { status: "QUALIFIED" }).expect(200);
      await patch(lead.id, { status: "IN_PROGRESS" }).expect(400);
    });

    it("o responsável só pode ser alguém da conta", async () => {
      const lead = await createLead();
      const deFora = await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({ name: "De Fora", email: "fora@lead-stages-e2e.local", password: "password123", organizationName: "Lead Stages E2E Outra" })
        .expect(201);
      const idDeFora = JSON.parse(Buffer.from(deFora.body.accessToken.split(".")[1], "base64").toString("utf8")).sub;

      const recusa = await patch(lead.id, { responsavelId: idDeFora }).expect(400);
      expect(recusa.body.code).toBe("RESPONSAVEL_INVALIDO");

      await patch(lead.id, { responsavelId: eu() }).expect(200);
      const ficha = await request(app.getHttpServer()).get(`/api/leads/${lead.id}`).set("Authorization", `Bearer ${token}`).expect(200);
      expect(ficha.body.responsavel).toEqual({ id: eu(), name: "User" });
      expect(ficha.body.events.map((e: { type: string }) => e.type)).toContain("OWNER_ASSIGNED");
    });

    it("filtra por responsável e lista só as pessoas da conta", async () => {
      const meu = await createLead();
      await patch(meu.id, { responsavelId: eu() }).expect(200);
      const semDono = await createLead();

      const meus = await request(app.getHttpServer()).get("/api/leads?responsavel=eu&limit=100").set("Authorization", `Bearer ${token}`).expect(200);
      const ids = meus.body.items.map((l: { id: string }) => l.id);
      expect(ids).toContain(meu.id);
      expect(ids).not.toContain(semDono.id);

      const nenhum = await request(app.getHttpServer()).get("/api/leads?responsavel=nenhum&limit=100").set("Authorization", `Bearer ${token}`).expect(200);
      expect(nenhum.body.items.map((l: { id: string }) => l.id)).toContain(semDono.id);

      await request(app.getHttpServer()).get("/api/leads?responsavel=qualquer").set("Authorization", `Bearer ${token}`).expect(400);

      const pessoas = await request(app.getHttpServer()).get("/api/leads/responsaveis").set("Authorization", `Bearer ${token}`).expect(200);
      expect(pessoas.body).toEqual([{ id: eu(), name: "User" }]);
    });

    it("guarda valor potencial e próxima ação, e limpa com null", async () => {
      const lead = await createLead();

      await patch(lead.id, { valorPotencialCentavos: 250000, proximaAcao: "Mandar proposta", proximaAcaoEm: "2026-10-05" }).expect(200);
      let salvo = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(salvo).toMatchObject({ valorPotencialCentavos: 250000, proximaAcao: "Mandar proposta" });
      expect(salvo.proximaAcaoEm?.toISOString().slice(0, 10)).toBe("2026-10-05");

      await patch(lead.id, { proximaAcao: null, proximaAcaoEm: null }).expect(200);
      salvo = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(salvo).toMatchObject({ proximaAcao: null, proximaAcaoEm: null, valorPotencialCentavos: 250000 });

      await patch(lead.id, { valorPotencialCentavos: -1 }).expect(400);
    });
  });
});
