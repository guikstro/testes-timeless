import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Recebe o operador vindo da administração e o coloca dentro do cliente.
 *
 * A administração mora noutro endereço e não consegue gravar cookie aqui.
 * Então ela manda o navegador para cá com um código de uso único, e é este
 * handler que o troca pela sessão.
 *
 * Rota, e não página: a única coisa que acontece aqui é gravar cookie e
 * redirecionar, e uma página renderizaria HTML com o código ainda na URL.
 */
export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get("codigo");

  if (!codigo) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const resposta = await fetch(`${API_URL}/auth/entrega`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
    cache: "no-store",
  });

  if (!resposta.ok) {
    /*
      Código vencido ou já usado devolve ao login com um motivo legível.

      Acontece de verdade: o operador recarrega a aba, e o código já foi
      gasto. Sem o motivo, a tela de entrada apareceria sem explicação
      nenhuma depois de um clique que parecia certo.
    */
    const destino = new URL("/login", request.url);
    destino.searchParams.set("motivo", "entrada-expirada");
    return NextResponse.redirect(destino);
  }

  const { accessToken, refreshToken } = await resposta.json();

  /*
    Redireciona para o painel, e não renderiza nada aqui.

    O código fica na URL desta requisição, e uma página renderizada o
    manteria na barra de endereço, no histórico e no cabeçalho de origem das
    requisições seguintes. O redirecionamento o descarta na hora — ele já foi
    gasto, mas não há razão para deixá-lo à vista.
  */
  const pronto = NextResponse.redirect(new URL("/dashboard", request.url));
  pronto.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  pronto.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
  return pronto;
}
