import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Um identificador por requisição.
 *
 * É o fio que liga o que a pessoa viu na tela ao que ficou no log. Sem ele, um
 * cliente dizendo "deu erro agora há pouco" obriga a procurar por horário num
 * log de várias organizações, e a busca falha justamente quando há volume.
 *
 * Curto de propósito: alguém vai ler isto por telefone ou copiar de uma
 * captura de tela.
 */
export const CABECALHO_DO_ID = "x-request-id";

declare module "express" {
  interface Request {
    idDaRequisicao?: string;
  }
}

@Injectable()
export class IdDaRequisicaoMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Aceita o id de quem chamou quando ele existe, para o rastro atravessar
    // o site e a API como uma coisa só. Sanitizado porque vem de fora e acaba
    // num log.
    const recebido = String(req.headers[CABECALHO_DO_ID] ?? "");
    const valido = /^[A-Za-z0-9-]{6,64}$/.test(recebido) ? recebido : null;

    req.idDaRequisicao = valido ?? randomBytes(5).toString("hex");
    res.setHeader(CABECALHO_DO_ID, req.idDaRequisicao);
    next();
  }
}
