import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Encerra a visita ao cliente e devolve o operador à área da Timeless.
 *
 * A sessão dentro do cliente é revogada na API. A da Timeless, guardada ao
 * entrar (`entrar-como`), volta a ser a sessão deste navegador, e a próxima
 * página a renova. Sem sessão guardada (entrou antes desta mudança), é um
 * logout comum.
 */
export async function POST(request: NextRequest) {
  const refreshDoCliente = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const accessDoCliente = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const daTimeless = request.cookies.get(ADMIN_REFRESH_TOKEN_COOKIE)?.value;

  if (refreshDoCliente) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessDoCliente ? { Authorization: `Bearer ${accessDoCliente}` } : {}),
      },
      body: JSON.stringify({ refreshToken: refreshDoCliente }),
      cache: "no-store",
    }).catch(() => undefined);
  }

  // `/clientes` passa pelo middleware, que troca o refresh guardado por uma sessão nova.
  const resposta = NextResponse.json({ destino: daTimeless ? "/clientes" : "/login?motivo=saiu-do-cliente" });
  resposta.cookies.delete(ACCESS_TOKEN_COOKIE);
  resposta.cookies.delete(ADMIN_REFRESH_TOKEN_COOKIE);
  if (daTimeless) {
    resposta.cookies.set(REFRESH_TOKEN_COOKIE, daTimeless, { ...SESSION_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
  } else {
    resposta.cookies.delete(REFRESH_TOKEN_COOKIE);
  }
  return resposta;
}
