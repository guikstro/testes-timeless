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
  await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  Logger.log("Worker process started", "Bootstrap");
}

bootstrap();
