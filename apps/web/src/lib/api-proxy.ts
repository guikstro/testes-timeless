import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Repassa uma chamada do navegador para a API.
 *
 * Existe porque o navegador não alcança a API diretamente: o endereço dela é
 * interno ao Docker, e o token de sessão vive num cookie httpOnly deste
 * domínio, que só o servidor lê. Componentes de servidor usam `apiFetch`;
 * isto aqui é para o que precisa sair do lado do cliente.
 */
export async function repassaParaApi(
  request: NextRequest,
  caminho: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  const texto = await resposta.text();
  // A API devolve corpo vazio de verdade em algumas rotas, e `JSON.parse("")`
  // lança. Sem corpo, devolve só o status.
  if (!texto) return new NextResponse(null, { status: resposta.status });

  return new NextResponse(texto, {
    status: resposta.status,
    headers: { "Content-Type": "application/json" },
  });
}
