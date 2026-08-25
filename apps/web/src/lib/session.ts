export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const ACCESS_TOKEN_MAX_AGE = 60 * 15; // 15 minutes, mirrors backend access token TTL
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, mirrors backend refresh token TTL
