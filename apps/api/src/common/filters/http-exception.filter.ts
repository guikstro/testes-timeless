import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  /**
   * Vai na resposta para a tela poder mostrá-lo.
   *
   * É o que transforma "deu erro" em algo procurável: a pessoa lê o código na
   * tela e ele aparece igual no log, com a rota, a organização e a pilha.
   */
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: "INTERNAL_ERROR",
      message: "Ocorreu um erro inesperado.",
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        body = { code: defaultCodeForStatus(status), message: res };
      } else if (typeof res === "object" && res !== null) {
        const obj = res as Record<string, unknown>;
        body = {
          code: (obj.code as string) ?? defaultCodeForStatus(status),
          message:
            (obj.message as string) ??
            (Array.isArray(obj.message)
              ? (obj.message as string[]).join(", ")
              : "Erro na requisição."),
          details: obj.errors ?? undefined,
        };
      }
    }

    const requestId = request.idDaRequisicao;

    /*
      Registra tudo que não seja erro do cliente.

      O corte é em 500 de propósito: um 400 é a validação funcionando, e um
      404 é alguém pedindo o que não existe. Registrar os dois afogaria o que
      importa, e o log só serve se der para achar o defeito de verdade dentro
      dele.
    */
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const usuario = (request as Request & { user?: { userId?: string; organizationId?: string } }).user;

      this.logger.error(
        JSON.stringify({
          event: "erro_nao_tratado",
          requestId,
          method: request.method,
          path: request.url,
          status,
          // Quem e de qual cliente: sem isso, um erro que só acontece numa
          // organização é impossível de reproduzir.
          organizationId: usuario?.organizationId,
          userId: usuario?.userId,
          message: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    response.status(status).json({ ...body, requestId });
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_ERROR";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    default:
      return "ERROR";
  }
}
