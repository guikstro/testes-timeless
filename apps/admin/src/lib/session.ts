/**
 * A sessão da administração, com nomes próprios de cookie.
 *
 * Os nomes são diferentes dos do site do cliente de propósito, e não por
 * organização: é o que garante que, mesmo se um dia os dois forem servidos do
 * mesmo host por engano de configuração, a sessão de um não é aceita como a
 * do outro. A separação passa a estar no nome, não só no endereço.
 *
 * Com origens diferentes os cookies já não se enxergam. Isto é a segunda
 * tranca, para o caso de a primeira ser desfeita sem ninguém perceber.
 */
export const ADMIN_ACCESS_COOKIE = "adm_access";
export const ADMIN_REFRESH_COOKIE = "adm_refresh";
/** O desafio do segundo fator, entre a senha e o código. */
export const ADMIN_MFA_COOKIE = "adm_mfa_challenge";

export const ACCESS_MAX_AGE = 60 * 15;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;
export const MFA_MAX_AGE = 120;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  /*
    `secure` fora de desenvolvimento.

    Em produção a administração é servida por HTTPS e o cookie não deve
    trafegar em claro nunca. Em desenvolvimento a pilha roda em http, e exigir
    `secure` faria o navegador descartar o cookie silenciosamente, que é um
    jeito difícil de descobrir por que o login não "pega".
  */
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
