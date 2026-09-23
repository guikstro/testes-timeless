import { NextRequest } from "next/server";

/**
 * Repassa o IP de quem está entrando, e não o do contêiner.
 *
 * Sem isso o limite de tentativas da API conta todo mundo num balde só, e o
 * limite de login da administração, que é a porta mais sensível do sistema,
 * passa a ser compartilhado entre todos os operadores.
 */
export function cabecalhoDoIp(request: NextRequest): Record<string, string> {
  const encaminhado = request.headers.get("x-forwarded-for");
  return encaminhado ? { "x-forwarded-for": encaminhado } : {};
}
