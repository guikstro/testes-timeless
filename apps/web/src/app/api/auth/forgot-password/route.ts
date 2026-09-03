import { NextRequest, NextResponse } from "next/server";
import { cabecalhoDoIp } from "@/lib/ip-do-cliente";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Repassa o pedido de recuperação para a API.
 *
 * O IP de quem pediu vai junto. Sem ele, todas as tentativas chegariam com o
 * endereço deste contêiner, e o limite por IP da API contaria o mundo inteiro
 * como uma pessoa só: ou ninguém é barrado, ou todos são de uma vez.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.text();

  try {
    const resposta = await fetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhoDoIp(request) },
      body: corpo,
      cache: "no-store",
    });

    return new NextResponse(await resposta.text(), {
      status: resposta.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Servidor indisponível." }, { status: 503 });
  }
}
