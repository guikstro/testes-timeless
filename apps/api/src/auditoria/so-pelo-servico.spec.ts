import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Toda gravação de auditoria passa pelo AuditoriaService.
 *
 * É ele que tira senha, token e segredo do estado antes e depois, e que
 * guarda IP, aparelho e o nome de quem fez. Uma gravação direta pelo Prisma
 * pula tudo isso sem erro nenhum, e o primeiro sinal seria um token aparecendo
 * na tela de auditoria. Este teste é o que faz esquecer disso não passar.
 */
function arquivosTs(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith(".ts") && !nome.endsWith(".spec.ts") ? [caminho] : [];
  });
}

describe("gravação de auditoria", () => {
  it("só acontece dentro do AuditoriaService", () => {
    const raiz = join(__dirname, "..");
    const permitido = join(__dirname, "auditoria.service.ts");

    const violacoes = arquivosTs(raiz)
      .filter((arquivo) => arquivo !== permitido)
      .filter((arquivo) => /auditLog\.(create|createMany|update|updateMany|upsert)\(/.test(readFileSync(arquivo, "utf8")))
      .map((arquivo) => relative(raiz, arquivo));

    expect(violacoes).toEqual([]);
  });
});
