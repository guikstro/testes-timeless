import { NextRequest, NextResponse } from "next/server";
import { cabecalhosDoCliente } from "@/lib/ip-do-cliente";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type Params = { params: Promise<{ token: string }> };

/**
 * Aceite de quem já tem conta: repassa a senha (e o código, se houver) para a
 * API, que confere se são da conta do e-mail convidado e devolve a sessão, já
 * na conta do convite. A sessão vira cookie aqui.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const resposta = await fetch(`${API_URL}/publico/convites/${encodeURIComponent(token)}/com-senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhosDoCliente(request) },
    body: JSON.stringify(await request.json()),
    cache: "no-store",
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok || !corpo) {
    return NextResponse.json(corpo ?? { message: "Não foi possível aceitar o convite." }, { status: resposta.status || 502 });
  }

  const pronto = NextResponse.json({ ok: true });
  pronto.cookies.set(ACCESS_TOKEN_COOKIE, corpo.accessToken, { ...SESSION_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });
  pronto.cookies.set(REFRESH_TOKEN_COOKIE, corpo.refreshToken, { ...SESSION_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
  return pronto;
}
