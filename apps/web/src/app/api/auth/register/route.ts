import { NextRequest, NextResponse } from "next/server";
import { cabecalhoDoIp } from "@/lib/ip-do-cliente";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function POST(request: NextRequest) {
  const payload = await request.json();

  const backendResponse = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    // O IP de quem está tentando entrar, e não o do contêiner do site: sem
    // ele o limite de tentativas contaria todos os clientes num balde só.
    headers: { "Content-Type": "application/json", ...cabecalhoDoIp(request) },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await backendResponse.json();

  if (!backendResponse.ok) {
    return NextResponse.json(body, { status: backendResponse.status });
  }

  const response = NextResponse.json({ ok: true });
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
