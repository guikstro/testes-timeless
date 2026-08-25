import { ConsoleLogger, Injectable, LogLevel } from "@nestjs/common";

/**
 * JSON-line structured logger. Never pass tokens, secrets, or raw message
 * bodies as `meta` — only stable identifiers (tenant_id, lead_id, job_id,
 * external_event_id, event_type) per docs/ARCHITECTURE.md observability rules.
 */
@Injectable()
export class StructuredLoggerService extends ConsoleLogger {
  log(message: unknown, meta?: Record<string, unknown> | string): void {
    this.write("log", message, meta);
  }

  error(message: unknown, meta?: Record<string, unknown> | string): void {
    this.write("error", message, meta);
  }

  warn(message: unknown, meta?: Record<string, unknown> | string): void {
    this.write("warn", message, meta);
  }

  debug(message: unknown, meta?: Record<string, unknown> | string): void {
    this.write("debug", message, meta);
  }

  private write(
    level: LogLevel,
    message: unknown,
    meta?: Record<string, unknown> | string,
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === "string" ? message : JSON.stringify(message),
      context: typeof meta === "string" ? meta : undefined,
      ...(typeof meta === "object" ? meta : {}),
    };

    console.log(JSON.stringify(entry));
  }
}
