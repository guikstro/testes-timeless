import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { contextoDe } from "../auth/sessoes/contexto-do-cliente";
import { descreveAparelho, rotuloDoAparelho } from "../auth/sessoes/descreve-aparelho";

/**
 * De onde veio a requisição em andamento, para a auditoria saber sem que
 * cada serviço precise receber e repassar IP e navegador.
 *
 * Passar isso por parâmetro atravessaria vinte assinaturas que não têm nada a
 * ver com auditoria, e bastaria uma esquecer para o registro sair sem IP. O
 * AsyncLocalStorage já vem no Node, então não há dependência nova.
 */
export interface OrigemDaRequisicao {
  ip: string | null;
  /** O navegador descrito, "Chrome no macOS", e não o cabeçalho cru. */
  aparelho: string | null;
}

const armazem = new AsyncLocalStorage<OrigemDaRequisicao>();

/** A origem da requisição atual, ou nulos fora de uma requisição (worker, testes). */
export function origemDaRequisicao(): OrigemDaRequisicao {
  return armazem.getStore() ?? { ip: null, aparelho: null };
}

/** Roda uma função com uma origem conhecida. Existe para os testes. */
export function comOrigem<T>(origem: OrigemDaRequisicao, executar: () => T): T {
  return armazem.run(origem, executar);
}

@Injectable()
export class OrigemDaRequisicaoMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const { ip, userAgent } = contextoDe(req);
    armazem.run({ ip: ipLegivel(ip), aparelho: userAgent ? rotuloDoAparelho(descreveAparelho(userAgent)) : null }, next);
  }
}

/**
 * Um endereço IPv4 chega ao Node escrito como IPv6 ("::ffff:200.1.2.3"), que
 * é o mesmo endereço e ninguém reconhece. Na tela vale o formato de sempre.
 */
export function ipLegivel(ip: string | null): string | null {
  if (!ip) return null;
  return ip.startsWith("::ffff:") && ip.includes(".") ? ip.slice(7) : ip;
}
