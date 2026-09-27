/**
 * O endereço público do site, como o navegador o enxerga.
 *
 * Atrás do proxy do Render, `request.url` é `http://localhost:10000/...`: um
 * redirecionamento absoluto montado com ele manda o navegador para a porta
 * interna do servidor. O proxy informa o endereço de verdade nos cabeçalhos
 * `X-Forwarded-Host` e `X-Forwarded-Proto`, e é deles que a origem sai.
 *
 * O host é conferido antes de ser usado: um valor com barra, espaço ou
 * credencial não vira pedaço de endereço, e aí vale a origem da requisição.
 */
export function origemPublica(cabecalhos: Headers, origemDaRequisicao: string): string {
  const primeiro = (nome: string) => cabecalhos.get(nome)?.split(",")[0]?.trim() || null;

  const host = primeiro("x-forwarded-host") ?? primeiro("host");
  const protocolo = primeiro("x-forwarded-proto") ?? new URL(origemDaRequisicao).protocol.replace(":", "");

  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) || !/^https?$/.test(protocolo)) {
    return origemDaRequisicao;
  }
  return `${protocolo}://${host}`;
}
