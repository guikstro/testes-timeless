import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

// "/webhooks" saiu: a tela nunca existiu e o link quebrado no menu foi
// removido na Fase 9. "/admin" entrou para a renovação silenciosa de sessão
// abaixo também valer no painel do operador da plataforma.
const PROTECTED_PREFIXES = ["/dashboard", "/conversas", "/leads", "/links", "/integrations", "/settings", "/campanhas", "/relatorio", "/notifications", "/admin"];
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  if (request.cookies.get(ACCESS_TOKEN_COOKIE)?.value) {
    return NextResponse.next();
  }

  // The access token (15 min TTL) is gone but the refresh token (7 days) may
  // still be valid — silently rotate it instead of forcing a re-login every
  // 15 minutes, which was happening because nothing ever called this before.
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    try {
      const backendResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (backendResponse.ok) {
        const body = await backendResponse.json();

        // Make the new access token visible to this same request's downstream
        // Server Components (a Set-Cookie header alone only takes effect on
        // the browser's *next* request).
        request.cookies.set(ACCESS_TOKEN_COOKIE, body.accessToken);

        const response = NextResponse.next({ request });
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
    } catch {
      // Backend unreachable or refresh token invalid — fall through to login.
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/conversas/:path*",
    "/leads/:path*",
    "/links/:path*",
    "/integrations/:path*",
    "/settings/:path*",
    // Sem entrar aqui, o middleware nem roda na rota: a lista de prefixos
    // acima não basta sozinha, e a renovação silenciosa de sessão deixava de
    // valer justamente nas telas mais recentes.
    "/campanhas/:path*",
    "/relatorio/:path*",
    "/notifications/:path*",
    "/admin/:path*",
  ],
};
