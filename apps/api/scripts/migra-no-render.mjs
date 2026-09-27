/**
 * Aplica as migrations pendentes, só quando a construção roda no Render.
 *
 * Elas eram aplicadas à mão no Supabase, e uma versão que dependia de coluna
 * nova subia antes da coluna existir: a API passava a falhar em toda consulta
 * que lia a tabela. Rodando aqui, na construção, a ordem fica certa, e uma
 * migration que falha interrompe a construção, deixando a versão anterior no
 * ar em vez de uma nova quebrada.
 *
 * Fora do Render não faz nada: a construção da imagem Docker e a máquina de
 * quem desenvolve não têm banco de produção à mão, e não devem ter.
 *
 * Em JavaScript, e não num `test -z` no package.json, porque a construção
 * também roda em Windows, onde o shell não tem `test`.
 */
import { execSync } from "node:child_process";

if (process.env.RENDER) {
  console.log("Render: aplicando migrations pendentes");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log("Fora do Render: migrations não são aplicadas na construção");
}
