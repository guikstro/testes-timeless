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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Entra num cliente: pede à API um par de tokens marcado como impersonação e
 * troca a sessão do navegador por ele, **guardando a sessão original do
 * operador** nos cookies `admin_*` para o "sair do cliente" conseguir
 * restaurá-la (os cookies são httpOnly; sem essa cópia, voltar exigiria
 * novo login).
 */
export async function POST(request: NextRequest) {
  const { organizationId } = await request.json();
  const adminAccessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const adminRefreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!adminAccessToken) {
    return NextResponse.json({ code: "UNAUTHORIZED", message: "Não autenticado." }, { status: 401 });
  }

  const backendResponse = await fetch(`${API_URL}/admin/organizations/${organizationId}/impersonate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminAccessToken}` },
    cache: "no-store",
  });

  const body = await backendResponse.json();
  if (!backendResponse.ok) {
    return NextResponse.json(body, { status: backendResponse.status });
  }

  const response = NextResponse.json({ ok: true, organization: body.organization });

  // A sessão do operador é preservada ANTES de ser sobrescrita.
  response.cookies.set(ADMIN_ACCESS_TOKEN_COOKIE, adminAccessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  if (adminRefreshToken) {
    response.cookies.set(ADMIN_REFRESH_TOKEN_COOKIE, adminRefreshToken, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }

  response.cookies.set(ACCESS_TOKEN_COOKIE, body.accessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, body.refreshToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });

  return response;
}
