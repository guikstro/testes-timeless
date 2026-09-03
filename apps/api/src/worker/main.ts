import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";
import { confereAmbiente } from "../common/configuracao/ambiente";

/**
 * Standalone BullMQ worker process. Runs the same queue processors used by
 * the API but without an HTTP listener, so it can be scaled independently.
 * Processors are registered as they are implemented per phase — see
 * docs/ARCHITECTURE.md.
 */
async function bootstrap() {
  // Mesma conferência da API, com as exigências deste processo.
  confereAmbiente("worker");

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

  /*
    Desligar com ordem.

    Aqui isto vale ainda mais que na API: sem os ganchos, um `docker stop` no
    meio de um job o deixava marcado como em execução no Redis. O BullMQ só o
    recupera quando o verificador de travados passa, e um job que trava duas
    vezes é dado como falho de vez. Com os ganchos, o worker termina o que
    está na mão antes de sair.
  */
  app.enableShutdownHooks();

  Logger.log("Worker process started", "Bootstrap");
}

bootstrap();
