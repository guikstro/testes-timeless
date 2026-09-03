import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { MANUTENCAO_QUEUE } from "../../common/queue/queue.constants";
import { FaxinaService } from "./faxina.service";

@Processor(MANUTENCAO_QUEUE)
export class FaxinaProcessor extends WorkerHost {
  private readonly logger = new Logger(FaxinaProcessor.name);

  constructor(private readonly faxina: FaxinaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      await this.faxina.executar();
    } catch (erro) {
      this.logger.error(
        JSON.stringify({ event: "faxina_falhou", jobId: job.id, error: (erro as Error).message }),
      );
      throw erro;
    }
  }
}
