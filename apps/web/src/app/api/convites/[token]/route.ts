import { NextRequest, NextResponse } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";
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

/** Para quem é o convite, antes de a pessoa criar a senha. */
export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  return repassaParaApi(request, `/publico/convites/${encodeURIComponent(token)}`, {
    headers: cabecalhosDoCliente(request),
  });
}

/** Aceita o convite: a API cria a conta e devolve a sessão, que vira cookie aqui. */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const resposta = await fetch(`${API_URL}/publico/convites/${encodeURIComponent(token)}`, {
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
