import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";

/**
 * Standalone BullMQ worker process. Runs the same queue processors used by
 * the API but without an HTTP listener, so it can be scaled independently.
 * Processors are registered as they are implemented per phase — see
 * docs/ARCHITECTURE.md.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });

  /*
    Sem isto o worker é mudo.

    `bufferLogs` segura tudo que for registrado até alguém mandar despejar.
    O `NestFactory.create()` da API faz isso sozinho ao subir o servidor, mas
    o `createApplicationContext` não tem esse passo, e ninguém chamava o
    despejo aqui. O resultado é que o processo funcionava e não dizia nada:
    falha de ingestão do WhatsApp, falha de sincronia com a Meta, falha de
    envio, aviso que não foi gravado, tudo ia para um buffer que nunca era
    lido. O contêiner da API tinha milhares de linhas de log e o do worker,
    exatamente zero, o que fazia todo problema daqui parecer não existir.
  */
  app.flushLogs();

  Logger.log("Worker process started", "Bootstrap");
}

bootstrap();
