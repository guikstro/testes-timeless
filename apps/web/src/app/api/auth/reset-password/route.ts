import { NextRequest, NextResponse } from "next/server";
import { cabecalhoDoIp } from "@/lib/ip-do-cliente";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Troca o token de recuperação por uma senha nova.
 *
 * Nenhum cookie é gravado aqui de propósito: trocar a senha não deve deixar
 * ninguém logado. A API derruba todas as sessões da conta nesse momento, e
 * emitir uma nova sessão aqui desfaria justamente a proteção de quem está
 * recuperando a conta depois de desconfiar de alguém.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.text();

  try {
    const resposta = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhoDoIp(request) },
      body: corpo,
      cache: "no-store",
    });

    const texto = await resposta.text();
    if (!texto) return new NextResponse(null, { status: resposta.status });

    return new NextResponse(texto, {
      status: resposta.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Servidor indisponível." }, { status: 503 });
  }
}
