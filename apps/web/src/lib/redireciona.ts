import { NextRequest, NextResponse } from "next/server";
import { origemPublica } from "./origem-publica";

/**
 * Redireciona para um caminho do próprio site, com endereço absoluto.
 *
 * Absoluto porque o middleware do Next não aceita outro: um `Location`
 * relativo ("/login") faz ele lançar "URL is malformed" e responder 500, e foi
 * isso que derrubou toda tela protegida para quem estava sem sessão. A origem
 * é a pública (ver `origemPublica`), e não a interna do servidor.
 */
export function redireciona(request: NextRequest, caminho: string): NextResponse {
  return NextResponse.redirect(new URL(caminho, origemPublica(request.headers, request.nextUrl.origin)), 307);
}
