/**
 * Monta o caminho de uma chamada à API codificando cada pedaço variável.
 *
 * As ações do servidor recebem ids do navegador, e um id com "../" ou "?"
 * interpolado cru mudaria a rota chamada. A API continua filtrando tudo pela
 * organização da sessão, então isso não abriria acesso a outro cliente, mas
 * a rota chamada tem de ser a que o código diz, e não a que o valor quiser.
 *
 *   rota`/leads/${id}/messages`
 */
export function rota(partes: TemplateStringsArray, ...valores: (string | number)[]): string {
  return partes.reduce((caminho, parte, i) => caminho + parte + (i < valores.length ? encodeURIComponent(String(valores[i])) : ""), "");
}
