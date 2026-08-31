import { NextRequest, NextResponse } from "next/server";
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

  const backendResponse = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await backendResponse.json();

  if (!backendResponse.ok) {
    return NextResponse.json(body, { status: backendResponse.status });
  }

  // Busca o nome com o token recém-emitido para a tela de entrada poder
  // cumprimentar quem volta. É aqui, e não num endpoint público que receba um
  // e-mail: responder "quem é o dono deste e-mail?" antes da senha revelaria
  // quais e-mails têm conta, que é exatamente o que o login evita hoje ao
  // comparar contra um hash falso e devolver sempre a mesma mensagem.
  let firstName: string | null = null;
  try {
    const session = await fetch(`${API_URL}/auth/session`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
      cache: "no-store",
    });
    if (session.ok) {
      const data = await session.json();
      firstName = String(data?.user?.name ?? "").trim().split(/\s+/)[0] || null;
    }
  } catch {
    // Saudação é enfeite: se falhar, o login continua valendo.
  }

  const response = NextResponse.json({ ok: true, firstName });
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
