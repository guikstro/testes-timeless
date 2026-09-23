import { JwtStrategy } from "./jwt.strategy";
import { AppException } from "../../common/exceptions/app-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtPayload } from "../jwt-payload.interface";

/**
 * O prazo da impersonação e a sessão aberta são verificados aqui, e não só no
 * refresh, para valer em TODA requisição autenticada: um access token já
 * emitido continuaria sendo aceito até seu próprio vencimento.
 */
describe("JwtStrategy", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  function monta(sessao: { encerradaEm: Date | null } | null = { encerradaEm: null }) {
    const prisma = { sessao: { findUnique: jest.fn().mockResolvedValue(sessao) } };
    return { strategy: new JwtStrategy(prisma as unknown as PrismaService), prisma };
  }

  function payload(overrides: Partial<JwtPayload> = {}): JwtPayload {
    return {
      sub: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      jti: "jti-1",
      sid: "sessao-1",
      ...overrides,
    };
  }

  const inTenMinutes = () => Math.floor(Date.now() / 1000) + 600;
  const tenMinutesAgo = () => Math.floor(Date.now() / 1000) - 600;

  it("maps a normal session and reports it as not impersonating", async () => {
    const { strategy } = monta();

    await expect(strategy.validate(payload())).resolves.toEqual({
      userId: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      impersonating: false,
      sessaoId: "sessao-1",
    });
  });

  it("accepts an impersonation that is still within its deadline", async () => {
    const { strategy } = monta();

    const result = await strategy.validate(
      payload({ impersonating: true, impersonationExpiresAt: inTenMinutes() }),
    );

    expect(result.impersonating).toBe(true);
    expect(result.organizationId).toBe("org-1");
  });

  it("rejects an impersonation whose deadline has passed", async () => {
    const { strategy } = monta();

    await expect(
      strategy.validate(payload({ impersonating: true, impersonationExpiresAt: tenMinutesAgo() })),
    ).rejects.toThrow(AppException);
  });

  /**
   * Um token forjado/antigo marcado como impersonação mas sem prazo não pode
   * valer para sempre — a ausência do campo é tratada como já vencido.
   */
  it("rejects an impersonation with no deadline at all instead of treating it as unlimited", async () => {
    const { strategy } = monta();

    await expect(strategy.validate(payload({ impersonating: true }))).rejects.toThrow(AppException);
  });

  it("never applies the deadline to a normal session", async () => {
    const { strategy } = monta();

    // Mesmo com um prazo vencido no token, sem `impersonating` a sessão é comum.
    await expect(strategy.validate(payload({ impersonationExpiresAt: tenMinutesAgo() }))).resolves.toBeDefined();
  });

  /*
    O que faz "encerrar sessão" valer na hora. Sem esta conferência, quem
    roubou uma sessão continuaria dentro por até quinze minutos depois de a
    vítima apertar o botão — que é justamente o momento em que ela aperta.
  */
  describe("sessão encerrada", () => {
    it("recusa o token de uma sessão encerrada, mesmo dentro da validade", async () => {
      const { strategy } = monta({ encerradaEm: new Date() });

      await expect(strategy.validate(payload())).rejects.toMatchObject({
        response: { code: "SESSAO_ENCERRADA" },
      });
    });

    it("recusa o token de uma sessão que não existe mais", async () => {
      const { strategy } = monta(null);
      await expect(strategy.validate(payload())).rejects.toThrow(AppException);
    });

    it("aceita token de antes das sessões existirem, sem consultar nada", async () => {
      // Vence sozinho em no máximo quinze minutos, e a renovação dele já nasce
      // com sessão. Recusar aqui expulsaria todo mundo no dia da mudança.
      const { strategy, prisma } = monta();

      await expect(strategy.validate(payload({ sid: undefined }))).resolves.toMatchObject({ userId: "user-1" });
      expect(prisma.sessao.findUnique).not.toHaveBeenCalled();
    });

    it("lê só a coluna que precisa", async () => {
      // Roda em toda requisição autenticada: trazer a linha inteira seria
      // pagar por dados que ninguém lê.
      const { strategy, prisma } = monta();
      await strategy.validate(payload());

      expect(prisma.sessao.findUnique).toHaveBeenCalledWith({
        where: { id: "sessao-1" },
        select: { encerradaEm: true },
      });
    });
  });
});
