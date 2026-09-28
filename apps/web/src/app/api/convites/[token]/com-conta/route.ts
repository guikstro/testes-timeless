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
 * Aceite de quem já tem conta. A sessão aberta prova quem é; a API confere
 * se o e-mail é o do convite e devolve uma sessão nova, já na conta do
 * convite, que vira cookie aqui. Sem sessão, responde 401 e a página manda
 * entrar e voltar.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const acesso = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!acesso) return NextResponse.json({ message: "Entre com a sua conta para aceitar." }, { status: 401 });

  const resposta = await fetch(`${API_URL}/publico/convites/${encodeURIComponent(token)}/com-conta`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acesso}`, ...cabecalhosDoCliente(request) },
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
