/**
 * O que fazer com um refresh token apresentado para renovação.
 *
 * A rotação já existia: cada renovação revoga o token usado e emite outro. O
 * que faltava era aproveitar o que ela revela. Depois de uma rotação, o
 * navegador sobrescreve o cookie e nunca mais apresenta o token antigo. Então
 * se o token antigo aparece de novo, minutos depois, só há uma explicação:
 * alguém tem uma cópia. Quem roubou, ou quem foi roubado — não dá para saber
 * qual dos dois está do outro lado, e por isso a sessão inteira cai.
 *
 * O detalhe que impede isso de expulsar gente inocente é a carência.
 */

export type Veredicto =
  /** Token vivo: renova normalmente. */
  | "valido"
  /** Desconhecido, vencido, ou reapresentado dentro da carência: só recusa. */
  | "invalido"
  /** Reapresentado depois da carência: alguém tem cópia. Encerra a sessão. */
  | "reuso";

/**
 * Trinta segundos de carência depois da rotação.
 *
 * Existe por causa de uma corrida que acontece de verdade: o middleware do
 * site renova a sessão quando o token de acesso some, e uma página que dispara
 * duas requisições juntas — o documento e um prefetch — manda o mesmo refresh
 * token nas duas. A primeira rotaciona; a segunda chega milissegundos depois
 * com o token já revogado.
 *
 * Tratar isso como roubo expulsaria pessoas aleatoriamente ao navegar. Dentro
 * da carência a segunda requisição só é recusada, como já era antes; fora
 * dela, não há corrida que explique.
 */
export const CARENCIA_EM_MS = 30_000;

export function decideRenovacao(
  token: { revokedAt: Date | null; expiresAt: Date } | null,
  agora: Date = new Date(),
): Veredicto {
  if (!token) return "invalido";
  if (token.expiresAt.getTime() <= agora.getTime()) return "invalido";
  if (token.revokedAt === null) return "valido";

  const desdeARevogacao = agora.getTime() - token.revokedAt.getTime();
  return desdeARevogacao <= CARENCIA_EM_MS ? "invalido" : "reuso";
}
