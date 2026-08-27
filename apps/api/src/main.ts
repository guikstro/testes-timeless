import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger, RequestMethod } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  // rawBody: true preserves req.rawBody so the WhatsApp webhook can verify
  // Meta's HMAC signature over the exact bytes received (see
  // whatsapp-webhook/verify-signature.ts) — a re-serialized JSON body
  // wouldn't reliably match byte-for-byte.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.use(helmet());
  app.enableCors({
    origin: process.env.WEB_APP_URL?.split(",") ?? true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix("api", {
    exclude: [
      "health",
      { path: "r/:code", method: RequestMethod.GET },
      { path: "whatsapp-webhook", method: RequestMethod.GET },
      { path: "whatsapp-webhook", method: RequestMethod.POST },
      // Receptor da Evolution API (Fase 8). Mesmo motivo dos dois acima: é um
      // webhook chamado por um sistema externo e autenticado pelo segredo no
      // path, não pela sessão — logo fica fora do prefixo /api do app.
      { path: "whatsapp-webhook/evolution/:token", method: RequestMethod.POST },
    ],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, "Bootstrap");
}

bootstrap();
