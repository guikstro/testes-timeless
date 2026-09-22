import { NextRequest, NextResponse } from "next/server";
import { cabecalhoDoIp } from "@/lib/ip-do-cliente";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  MFA_CHALLENGE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Troca o código do segundo fator pela sessão.
 *
 * O desafio vem do cookie httpOnly gravado no login, nunca do corpo enviado
 * pela página: se a página pudesse mandar o desafio, ela precisaria tê-lo, e
 * tê-lo é o que não se quer.
 */
export async function POST(request: NextRequest) {
  const desafio = request.cookies.get(MFA_CHALLENGE_COOKIE)?.value;
  if (!desafio) {
    return NextResponse.json(
      { code: "DESAFIO_EXPIRADO", message: "O tempo para confirmar acabou. Entre de novo." },
      { status: 401 },
    );
  }

  const { codigo } = await request.json();

  const backendResponse = await fetch(`${API_URL}/auth/mfa/completar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhoDoIp(request) },
    body: JSON.stringify({ desafio, codigo }),
    cache: "no-store",
  });

  const body = await backendResponse.json();

  if (!backendResponse.ok) {
    return NextResponse.json(body, { status: backendResponse.status });
  }

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
    // Saudação é enfeite: se falhar, a entrada continua valendo.
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
  // O desafio morre no uso: um segundo código não deve poder ser tentado com
  // ele depois de a sessão existir.
  response.cookies.delete(MFA_CHALLENGE_COOKIE);
  return response;
}
