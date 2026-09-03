import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { QueueModule } from "../common/queue/queue.module";
import { ConexaoDeSaude } from "./conexao-de-saude";
import { HealthController } from "./health.controller";

@Module({
  // As filas entram para a checagem poder dizer se há worker do outro lado.
  imports: [TerminusModule, QueueModule],
  controllers: [HealthController],
  providers: [ConexaoDeSaude],
})
export class HealthModule {}
