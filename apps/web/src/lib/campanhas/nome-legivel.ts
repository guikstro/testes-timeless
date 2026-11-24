/**
 * O nome de campanha como a pessoa lê, e não como a agência o escreveu.
 *
 * Quem monta a campanha usa um código ("[TMLS] QZB - PESQUISA - RESCISÃO -
 * NOVEMBRO"): marca da agência, sigla do cliente, tipo e tese. Na tela, só a
 * tese e o mês importam. O nome completo continua à mão, no `title`.
 *
 * Só mexe em nomes no padrão "partes separadas por ' - '". Qualquer outro
 * formato volta como veio, porque adivinhar errado esconderia informação.
 */
export function nomeLegivelDaCampanha(nome: string): string {
  const semMarca = nome.replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim();
  const partes = semMarca.split(/\s+-\s+/).map((parte) => parte.trim()).filter(Boolean);
  if (partes.length < 2) return nome;

  const TIPOS = new Set(["PESQUISA", "SEARCH", "ENG", "ENGAJAMENTO", "AQUISIÇÃO", "AQUISICAO"]);
  const util = partes.filter((parte, i) => !(i === 0 && /^[A-Z0-9]{2,5}$/.test(parte)) && !TIPOS.has(parte.toUpperCase()));
  if (util.length === 0) return nome;

  return util
    .map((parte) => {
      const minusculo = parte.toLocaleLowerCase("pt-BR");
      return minusculo.charAt(0).toLocaleUpperCase("pt-BR") + minusculo.slice(1);
    })
    .join(" · ");
}
