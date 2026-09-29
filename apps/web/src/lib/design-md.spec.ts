/**
 * @jest-environment node
 */
import { readFileSync } from "fs";
import { join } from "path";

/**
 * O DESIGN.md da raiz é lido por ferramentas de IA para gerar tela. Se ele
 * disser um valor que o código já não usa, a tela nasce com a cor errada e
 * ninguém percebe até ver lado a lado. Este teste confere cada cor do
 * documento contra o globals.css, nos dois temas.
 */
const raiz = join(__dirname, "../../../..");
const css = readFileSync(join(raiz, "apps/web/src/app/globals.css"), "utf8");
const documento = readFileSync(join(raiz, "DESIGN.md"), "utf8");

/** O primeiro bloco do seletor: o de impressão, mais abaixo, tem outros valores de propósito. */
function bloco(seletor: string): string {
  const inicio = css.indexOf(`${seletor} {`);
  return css.slice(inicio, css.indexOf("}", inicio));
}

const hex = (triplo: string) =>
  `#${triplo
    .trim()
    .split(/\s+/)
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

const cores = (texto: string): Record<string, string> =>
  Object.fromEntries([...texto.matchAll(/--([a-z0-9-]+):\s*(\d+ \d+ \d+);/g)].map((m) => [m[1], hex(m[2])]));

const claro = cores(bloco(":root"));
const escuro = cores(bloco(".dark"));
const linhaDo = (token: string) => documento.split("\n").find((linha) => linha.includes(`| \`${token}\` |`));

describe("DESIGN.md", () => {
  it("encontra as cores no código", () => {
    expect(Object.keys(claro).length).toBeGreaterThan(20);
  });

  it.each(Object.keys(claro))("a cor %s tem os valores do código nos dois temas", (token) => {
    const linha = linhaDo(token);
    expect(linha).toBeDefined();
    expect(linha).toContain(`\`${claro[token]}\``);
    if (escuro[token]) expect(linha).toContain(`\`${escuro[token]}\``);
  });

  it("não descreve cor que o código não tem", () => {
    const doDocumento = [...documento.matchAll(/^\| [^|]+ \| `([a-z0-9-]+)` \| `#/gm)].map((m) => m[1]);
    expect(doDocumento.length).toBeGreaterThan(20);
    expect(doDocumento.filter((token) => !(token in claro))).toEqual([]);
  });
});
