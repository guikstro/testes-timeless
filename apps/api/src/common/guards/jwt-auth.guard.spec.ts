import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard: áreas", () => {
  // O passport já autenticou; aqui só importa a conferência da área.
  beforeAll(() => {
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), "canActivate").mockResolvedValue(true);
  });

  const contexto = (areas: string[] | null) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: { areas } }) }),
    }) as unknown as ExecutionContext;

  const guard = (exigidas: string[] | undefined) =>
    new JwtAuthGuard({ getAllAndOverride: () => exigidas } as unknown as Reflector);

  it("barra quem não tem nenhuma das áreas da rota", async () => {
    await expect(guard(["leads"]).canActivate(contexto(["conversas"]))).rejects.toMatchObject({
      response: { code: "SEM_ACESSO_A_AREA" },
    });
  });

  it("libera quem tem qualquer uma das áreas", async () => {
    await expect(guard(["leads", "conversas"]).canActivate(contexto(["conversas"]))).resolves.toBe(true);
  });

  it("libera tudo para quem não tem limite de área (dono, admin, operador)", async () => {
    await expect(guard(["leads"]).canActivate(contexto(null))).resolves.toBe(true);
  });

  it("rota sem área é livre", async () => {
    await expect(guard(undefined).canActivate(contexto([]))).resolves.toBe(true);
    await expect(guard([]).canActivate(contexto([]))).resolves.toBe(true);
  });
});
