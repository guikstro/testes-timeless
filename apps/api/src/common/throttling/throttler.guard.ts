import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";

/**
 * Conta por usuário quando há sessão, e por IP quando não há.
 *
 * Contar só por IP puniria escritório inteiro: dez pessoas atrás do mesmo
 * roteador dividiriam uma cota, e o trabalho de uma travaria o das outras.
 * Já quem não está logado só tem o IP para ser identificado, e é onde a
 * proteção precisa morder de qualquer forma.
 */
@Injectable()
export class UsuarioOuIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const usuario = (req as Request & { user?: AuthenticatedUser }).user;
    if (usuario?.userId) return `u:${usuario.userId}`;
    return `ip:${req.ip ?? "desconhecido"}`;
  }
}
