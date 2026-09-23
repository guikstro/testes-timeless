import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * De onde vem a requisição, como a pessoa veria.
 *
 * O IP sai de `req.ip`, que já honra o encaminhamento do site quando
 * `TRUST_PROXY` está ligado. É o mesmo IP que o limite de tentativas conta,
 * e manter os dois iguais evita que a tela de sessões mostre um endereço e o
 * bloqueio por excesso de tentativas use outro.
 *
 * O navegador vem de um cabeçalho próprio, e não do `User-Agent`: quem chama
 * a API é o servidor do site, e o `User-Agent` dele diria "Node" em toda
 * sessão. O site repassa o do navegador em `X-Client-User-Agent`.
 */
export interface ContextoDoCliente {
  userAgent: string | null;
  ip: string | null;
}

/** Limite de tamanho: um cabeçalho arbitrário não pode virar coluna arbitrária. */
const MAXIMO = 400;

export function contextoDe(request: Request): ContextoDoCliente {
  const repassado = request.headers["x-client-user-agent"];
  const bruto = (Array.isArray(repassado) ? repassado[0] : repassado) ?? request.headers["user-agent"] ?? null;

  return {
    userAgent: bruto ? String(bruto).slice(0, MAXIMO) : null,
    ip: request.ip ? request.ip.slice(0, 64) : null,
  };
}

export const Contexto = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContextoDoCliente => contextoDe(ctx.switchToHttp().getRequest<Request>()),
);
