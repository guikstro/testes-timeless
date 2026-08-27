import { JwtStrategy } from "./jwt.strategy";
import { AppException } from "../../common/exceptions/app-exception";
import { JwtPayload } from "../jwt-payload.interface";

/**
 * O prazo da impersonação é verificado aqui, e não só no refresh, para valer
 * em TODA requisição autenticada — um access token já emitido continuaria
 * sendo aceito até seu próprio vencimento (Fase 9).
 */
describe("JwtStrategy", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  function payload(overrides: Partial<JwtPayload> = {}): JwtPayload {
    return {
      sub: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      jti: "jti-1",
      ...overrides,
    };
  }

  const inTenMinutes = () => Math.floor(Date.now() / 1000) + 600;
  const tenMinutesAgo = () => Math.floor(Date.now() / 1000) - 600;

  it("maps a normal session and reports it as not impersonating", () => {
    const strategy = new JwtStrategy();

    expect(strategy.validate(payload())).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      impersonating: false,
    });
  });

  it("accepts an impersonation that is still within its deadline", () => {
    const strategy = new JwtStrategy();

    const result = strategy.validate(
      payload({ impersonating: true, impersonationExpiresAt: inTenMinutes() }),
    );

    expect(result.impersonating).toBe(true);
    expect(result.organizationId).toBe("org-1");
  });

  it("rejects an impersonation whose deadline has passed", () => {
    const strategy = new JwtStrategy();

    expect(() =>
      strategy.validate(payload({ impersonating: true, impersonationExpiresAt: tenMinutesAgo() })),
    ).toThrow(AppException);
  });

  /**
   * Um token forjado/antigo marcado como impersonação mas sem prazo não pode
   * valer para sempre — a ausência do campo é tratada como já vencido.
   */
  it("rejects an impersonation with no deadline at all instead of treating it as unlimited", () => {
    const strategy = new JwtStrategy();

    expect(() => strategy.validate(payload({ impersonating: true }))).toThrow(AppException);
  });

  it("never applies the deadline to a normal session", () => {
    const strategy = new JwtStrategy();

    // Mesmo com um prazo vencido no token, sem `impersonating` a sessão é comum.
    expect(() => strategy.validate(payload({ impersonationExpiresAt: tenMinutesAgo() }))).not.toThrow();
  });
});
