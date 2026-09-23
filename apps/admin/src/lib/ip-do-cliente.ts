import { NextRequest } from "next/server";

/**
 * Repassa à API quem está do outro lado, e não o contêiner.
 *
 * O IP, para o limite de tentativas contar cada operador separado: sem ele, o
 * limite de login da administração, que é a porta mais sensível do sistema,
 * seria um balde só para todos. E o navegador, para a tela de sessões mostrar
 * de onde cada uma foi aberta.
 */
export function cabecalhosDoCliente(request: NextRequest): Record<string, string> {
  const cabecalhos: Record<string, string> = {};

  const encaminhado = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (encaminhado) cabecalhos["X-Forwarded-For"] = encaminhado;

  const navegador = request.headers.get("user-agent");
  if (navegador) cabecalhos["X-Client-User-Agent"] = navegador.slice(0, 400);

  return cabecalhos;
}
