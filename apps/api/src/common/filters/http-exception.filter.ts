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
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
        undefined,
        `${request.method} ${request.url}`,
      );
    }

    response.status(status).json(body);
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
