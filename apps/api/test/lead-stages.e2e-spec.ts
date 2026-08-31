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
});
