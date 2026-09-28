import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { CAPACIDADE_KEY } from "./requer.decorator";

/*
  Rota logada de uma conta sem `@Requer` fica aberta a qualquer pessoa da
  conta, inclusive a quem trabalha só com uma área. Este teste lê todos os
  controllers e falha quando aparece uma assim, a não ser que o motivo esteja
  escrito aqui.
*/
const SEM_CAPACIDADE_DE_PROPOSITO: Record<string, string> = {
  AuthController: "a própria sessão, senha e e-mail de quem está logado",
  MfaController: "o segundo fator de quem está logado",
  SessoesController: "as sessões de quem está logado",
  NotificationsController: "as notificações de quem está logado",
  AdminController: "administração da plataforma, conferida pelo PlatformAdminGuard",
  SaudeDaPlataformaController: "saúde da plataforma, conferida pelo PlatformAdminGuard",
};

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return controllers(caminho);
    return nome.endsWith(".controller.ts") ? [caminho] : [];
  });
}

describe("toda rota logada declara a capacidade", () => {
  it("ou tem o motivo escrito", () => {
    const semDeclarar: string[] = [];

    for (const arquivo of controllers(join(__dirname, "../.."))) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const modulo = require(arquivo) as Record<string, unknown>;
      for (const classe of Object.values(modulo)) {
        if (typeof classe !== "function" || Reflect.getMetadata(PATH_METADATA, classe) === undefined) continue;
        if (classe.name in SEM_CAPACIDADE_DE_PROPOSITO) continue;

        const guardsDaClasse: unknown[] = Reflect.getMetadata(GUARDS_METADATA, classe) ?? [];
        const daClasse = Reflect.getMetadata(CAPACIDADE_KEY, classe);

        for (const nome of Object.getOwnPropertyNames(classe.prototype)) {
          const metodo = classe.prototype[nome];
          if (nome === "constructor" || Reflect.getMetadata(METHOD_METADATA, metodo) === undefined) continue;
          const guards = [...guardsDaClasse, ...((Reflect.getMetadata(GUARDS_METADATA, metodo) as unknown[]) ?? [])];
          if (!guards.includes(JwtAuthGuard)) continue;
          if (Reflect.getMetadata(CAPACIDADE_KEY, metodo) === undefined && daClasse === undefined) {
            semDeclarar.push(`${classe.name}.${nome}`);
          }
        }
      }
    }

    expect(semDeclarar).toEqual([]);
  });
});
