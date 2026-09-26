import { NextResponse } from "next/server";

/**
 * Redireciona com endereço relativo.
 *
 * Atrás do proxy do Render, `request.url` é `http://localhost:10000/...`, e um
 * endereço absoluto montado com ele manda o navegador para a porta interna do
 * servidor. O navegador resolve um `Location` relativo contra o endereço que
 * ele mesmo está vendo, que é o certo.
 */
export function redireciona(caminho: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: caminho } });
}
