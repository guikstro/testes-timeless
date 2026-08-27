export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * Guardam a sessão própria do operador da plataforma enquanto ele está
 * dentro de um cliente (Fase 9). Sem isso, "sair do cliente" exigiria login
 * de novo: os cookies principais foram sobrescritos pelos tokens da
 * organização visitada, e eles são httpOnly — o navegador não consegue
 * recuperá-los por conta própria.
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
