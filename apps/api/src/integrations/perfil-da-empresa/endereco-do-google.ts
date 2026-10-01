import { enderecoDaAplicacao } from "../../common/configuracao/ambiente";

/**
 * Os endereços do Google, num lugar só.
 *
 * Com `GOOGLE_API_BASE_URL` (testes e desenvolvimento), todos vão para um
 * dublê, com o host no começo do caminho: `.../oauth2.googleapis.com/token`.
 * Não há credencial do Google neste ambiente, então o contrato (paginação,
 * formato de erro, valor zero omitido) é conferido contra um dublê que imita
 * a documentação, como na Meta.
 */
export function noGoogle(endereco: string): string {
  const base = process.env.GOOGLE_API_BASE_URL?.trim();
  if (!base) return endereco;
  const url = new URL(endereco);
  return `${base.replace(/\/$/, "")}/${url.host}${url.pathname}${url.search}`;
}

/** As credenciais do app no Google Cloud. Sem elas, a tela diz o que falta em vez de quebrar. */
export function credenciaisDoGoogle(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Para onde o Google devolve quem autorizou. No site, e dentro de /clientes:
 * é caminho protegido, e o site renova a sessão ali se ela venceu durante o
 * consentimento, em vez de perder o código.
 *
 * Precisa estar cadastrado igual no Google Cloud, em Credenciais, no cliente
 * OAuth: "URIs de redirecionamento autorizados".
 */
export function enderecoDeRetorno(): string {
  return `${enderecoDaAplicacao()}/clientes/perfil-da-empresa/retorno`;
}
