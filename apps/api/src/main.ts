import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe, Logger, RequestMethod } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  // rawBody: true preserves req.rawBody so the WhatsApp webhook can verify
  // Meta's HMAC signature over the exact bytes received (see
  // whatsapp-webhook/verify-signature.ts) — a re-serialized JSON body
  // wouldn't reliably match byte-for-byte.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // O padrão do Express (100kb) é pequeno demais para um webhook de WhatsApp:
  // uma instância da Evolution configurada para enviar mídia embutida produz
  // payloads de megabytes, e o 413 resultante descartava a mensagem inteira em
  // vez de só o anexo. Instâncias novas já não pedem base64 (ver
  // evolution-client.ts), mas as criadas antes disso continuam enviando, então
  // o limite generoso protege quem já está conectado.
  //
  // Generoso, não ilimitado: aceitar qualquer tamanho transformaria o webhook
  // público num vetor de exaustão de memória.
  app.useBodyParser("json", { limit: "10mb" });

  /*
    Quantos proxies existem na frente da API, para o IP do visitante ser o
    real e não o do balanceador.

    Precisa ser configurado de propósito, e não ligado por padrão: confiar no
    cabeçalho `X-Forwarded-For` sem proxy na frente deixa qualquer pessoa
    escrever o IP que quiser, e o limite de requisições vira enfeite, porque
    cada tentativa parece vir de um endereço novo. Desligado, o limite conta
    pelo IP do socket, que ninguém falsifica.
  */
  const proxiesConfiaveis = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(proxiesConfiaveis) && proxiesConfiaveis > 0) {
    app.set("trust proxy", proxiesConfiaveis);
  }

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
      // Imagens enviadas pelo cliente. Fora do prefixo e sem sessão: a logo
      // aparece em relatório impresso e em tela pública, e exigir token ali
      // quebraria a imagem sem ganho nenhum.
      { path: "uploads/:nome", method: RequestMethod.GET },
      { path: "whatsapp-webhook", method: RequestMethod.GET },
      { path: "whatsapp-webhook", method: RequestMethod.POST },
      // Receptor da Evolution API (Fase 8). Mesmo motivo dos dois acima: é um
      // webhook chamado por um sistema externo e autenticado pelo segredo no
      // path, não pela sessão — logo fica fora do prefixo /api do app.
      { path: "whatsapp-webhook/evolution/:token", method: RequestMethod.POST },
    ],
  });

  /*
    Desligar com ordem, em vez de ser morto no meio.

    Sem isto, `docker stop` mandava o sinal, ninguém escutava, e dez segundos
    depois o processo era morto: requisição em andamento cortada, conexão de
    tempo real pendurada, e o `$disconnect` do Prisma nunca chamado. Com os
    ganchos ligados, o Nest percorre os `onModuleDestroy` antes de sair, que é
    onde as conexões com Redis e Postgres se despedem.
  */
  app.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, "Bootstrap");
}

bootstrap();
