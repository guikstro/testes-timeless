import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard: capacidades", () => {
  // O passport já autenticou; aqui só importa a conferência da capacidade.
  beforeAll(() => {
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), "canActivate").mockResolvedValue(true);
  });

  const contexto = (user: { role: string; areas: string[] | null }) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const guard = (exigida: string | null | undefined) =>
    new JwtAuthGuard({ getAllAndOverride: () => exigida } as unknown as Reflector);

  it("barra quem não tem nenhuma área que libere a capacidade", async () => {
    await expect(guard("lead.read").canActivate(contexto({ role: "MEMBER", areas: ["links"] }))).rejects.toMatchObject({
      response: { code: "SEM_ACESSO_A_AREA" },
    });
  });

  it("libera quem tem uma área que libera", async () => {
    await expect(guard("lead.read").canActivate(contexto({ role: "MEMBER", areas: ["conversas"] }))).resolves.toBe(true);
  });

  it("libera dono e administrador sem olhar área", async () => {
    await expect(guard("lead.read").canActivate(contexto({ role: "ADMIN", areas: null }))).resolves.toBe(true);
  });

  it("rota sem capacidade é livre", async () => {
    await expect(guard(undefined).canActivate(contexto({ role: "MEMBER", areas: [] }))).resolves.toBe(true);
    await expect(guard(null).canActivate(contexto({ role: "MEMBER", areas: [] }))).resolves.toBe(true);
  });
});
