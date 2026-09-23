import { NextRequest, NextResponse } from "next/server";
import { cabecalhoDoIp } from "@/lib/ip-do-cliente";
import {
  ACCESS_MAX_AGE,
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  COOKIE_OPTIONS,
  REFRESH_MAX_AGE,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Tudo aqui é protegido, menos o login.
 *
 * O site do cliente lista os caminhos que exigem sessão; aqui a lista é o
 * contrário, e a diferença não é estilo: lá existem telas públicas por
 * natureza, e aqui não existe nenhuma. Uma tela nova nasce fechada, e abrir
 * exige escrever o caminho nesta lista de propósito. Numa lista de protegidos,
 * a tela esquecida nasce aberta.
 */
const PUBLICAS = ["/login"];

/**
 * O caminho, para o layout raiz saber se está desenhando o login.
 *
 * O layout raiz envolve todas as rotas e não recebe a URL. Sem este
 * cabeçalho, ele buscaria sessão para a tela de entrada e daria erro em toda
 * visita de quem ainda não entrou.
 */
function comCaminho(resposta: NextResponse, caminho: string): NextResponse {
  resposta.headers.set("x-pathname", caminho);
  return resposta;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const seguir = () => {
    const requisicao = new Headers(request.headers);
    requisicao.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: requisicao } });
  };

  if (PUBLICAS.some((publica) => pathname === publica || pathname.startsWith(`${publica}/`))) {
    return seguir();
  }

  if (request.cookies.get(ADMIN_ACCESS_COOKIE)?.value) {
    return seguir();
  }

  // Mesma renovação silenciosa do site do cliente. Sem ela o operador seria
  // devolvido ao login a cada quinze minutos, e a cada vez com o segundo
  // fator junto.
  const refresh = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  if (refresh) {
    try {
      const resposta = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cabecalhoDoIp(request) },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (resposta.ok) {
        const body = await resposta.json();

        const requisicao = new Headers(request.headers);
        requisicao.set("x-pathname", pathname);
        request.cookies.set(ADMIN_ACCESS_COOKIE, body.accessToken);

        const adiante = NextResponse.next({ request: { headers: requisicao } });
        adiante.cookies.set(ADMIN_ACCESS_COOKIE, body.accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_MAX_AGE });
        adiante.cookies.set(ADMIN_REFRESH_COOKIE, body.refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_MAX_AGE });
        return adiante;
      }
    } catch {
      // API fora do ar ou token inválido: cai para o login.
    }
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return comCaminho(NextResponse.redirect(login), pathname);
}

export const config = {
  /*
    Tudo, menos o que o Next serve sozinho e as próprias rotas de sessão.

    Uma lista de caminhos protegidos, como a do site do cliente, tem o defeito
    de a tela nova esquecida ficar aberta. Aqui o padrão é o oposto.
  */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
