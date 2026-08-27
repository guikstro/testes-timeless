import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

/**
 * Sai do cliente e restaura a sessão própria do operador a partir dos
 * cookies `admin_*` guardados na entrada.
 *
 * Se a sessão guardada tiver expirado (o operador ficou horas dentro do
 * cliente), não há o que restaurar: limpamos tudo e mandamos para o login,
 * em vez de deixar a pessoa presa numa sessão de impersonação sem saída.
 */
export async function POST(request: NextRequest) {
  const adminAccessToken = request.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value;
  const adminRefreshToken = request.cookies.get(ADMIN_REFRESH_TOKEN_COOKIE)?.value;

  if (!adminAccessToken) {
    const expired = NextResponse.json({ ok: false, reason: "ADMIN_SESSION_EXPIRED" }, { status: 409 });
    expired.cookies.delete(ACCESS_TOKEN_COOKIE);
    expired.cookies.delete(REFRESH_TOKEN_COOKIE);
    expired.cookies.delete(ADMIN_ACCESS_TOKEN_COOKIE);
    expired.cookies.delete(ADMIN_REFRESH_TOKEN_COOKIE);
    return expired;
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(ACCESS_TOKEN_COOKIE, adminAccessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  if (adminRefreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, adminRefreshToken, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  } else {
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
  }

  // A cópia só existe enquanto a impersonação dura.
  response.cookies.delete(ADMIN_ACCESS_TOKEN_COOKIE);
  response.cookies.delete(ADMIN_REFRESH_TOKEN_COOKIE);

  return response;
}
