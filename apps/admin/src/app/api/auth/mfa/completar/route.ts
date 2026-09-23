import { NextRequest, NextResponse } from "next/server";
import { cabecalhosDoCliente } from "@/lib/ip-do-cliente";
import {
  ACCESS_MAX_AGE,
  ADMIN_ACCESS_COOKIE,
  ADMIN_MFA_COOKIE,
  ADMIN_REFRESH_COOKIE,
  COOKIE_OPTIONS,
  REFRESH_MAX_AGE,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Troca o código do segundo fator pela sessão da administração. */
export async function POST(request: NextRequest) {
  const desafio = request.cookies.get(ADMIN_MFA_COOKIE)?.value;
  if (!desafio) {
    return NextResponse.json(
      { code: "DESAFIO_EXPIRADO", message: "O tempo para confirmar acabou. Entre de novo." },
      { status: 401 },
    );
  }

  const { codigo } = await request.json();

  const resposta = await fetch(`${API_URL}/auth/mfa/completar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhosDoCliente(request) },
    body: JSON.stringify({ desafio, codigo }),
    cache: "no-store",
  });

  const body = await resposta.json();
  if (!resposta.ok) {
    return NextResponse.json(body, { status: resposta.status });
  }

  const ok = NextResponse.json({ ok: true });
  ok.cookies.set(ADMIN_ACCESS_COOKIE, body.accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_MAX_AGE });
  ok.cookies.set(ADMIN_REFRESH_COOKIE, body.refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_MAX_AGE });
  // O desafio morre no uso: com a sessão existindo, ele não pode servir de
  // novo para nada.
  ok.cookies.delete(ADMIN_MFA_COOKIE);
  return ok;
}
