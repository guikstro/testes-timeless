export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * Guardam a sessão própria do operador da plataforma enquanto ele está
 * dentro de um cliente (Fase 9). Sem isso, "sair do cliente" exigiria login
 * de novo: os cookies principais foram sobrescritos pelos tokens da
 * organização visitada, e eles são httpOnly — o navegador não consegue
 * recuperá-los por conta própria.
 */
/**
 * O desafio do segundo fator, entre a senha e o código.
 *
 * Em cookie httpOnly e não na resposta: ele vale uma sessão inteira quando
 * trocado, e devolvê-lo ao JavaScript da página o exporia a qualquer script
 * que rodasse ali. A página só precisa saber que o código é necessário, não
 * qual é o desafio.
 */
export const MFA_CHALLENGE_COOKIE = "mfa_challenge";
/** Dois minutos, o mesmo prazo do token no servidor. */
export const MFA_CHALLENGE_MAX_AGE = 120;

/*
  Resquício do tempo em que a administração morava aqui dentro.

  Estes cookies guardavam a sessão do operador enquanto ele visitava um
  cliente. A administração tem site próprio agora e nada mais os escreve, mas
  navegadores que passaram pelo fluxo antigo ainda os têm. Continuam
  declarados só para o logout poder apagá-los.
*/
export const ADMIN_ACCESS_TOKEN_COOKIE = "admin_access_token";
export const ADMIN_REFRESH_TOKEN_COOKIE = "admin_refresh_token";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const ACCESS_TOKEN_MAX_AGE = 60 * 15; // 15 minutes, mirrors backend access token TTL
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, mirrors backend refresh token TTL
