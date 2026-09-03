import { NextRequest, NextResponse } from "next/server";
import { cabecalhoDoIp } from "@/lib/ip-do-cliente";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Confirma a troca do e-mail de acesso.
 *
 * A sessão local é apagada quando dá certo. A API derruba todas as sessões
 * nesse momento de propósito, e manter o cookie aqui deixaria a aba com um
 * token que já não vale, produzindo erro na próxima navegação em vez de um
 * pedido claro de entrar de novo.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.text();

  try {
    const resposta = await fetch(`${API_URL}/auth/confirm-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhoDoIp(request) },
      body: corpo,
      cache: "no-store",
    });

    const texto = await resposta.text();
    const saida = texto
      ? new NextResponse(texto, { status: resposta.status, headers: { "Content-Type": "application/json" } })
      : new NextResponse(null, { status: resposta.status });

    if (resposta.ok) {
      saida.cookies.delete(ACCESS_TOKEN_COOKIE);
      saida.cookies.delete(REFRESH_TOKEN_COOKIE);
    }
    return saida;
  } catch {
    return NextResponse.json({ message: "Servidor indisponível." }, { status: 503 });
  }
}
