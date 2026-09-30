import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { META_SYNC_QUEUE, SINCRONIA_APOS_LIMITE, SINCRONIA_PERIODICA } from "../../common/queue/queue.constants";
import { MetaSyncJob } from "../../common/queue/meta-sync.job";
import { AgendaDeSincronia } from "../agenda-de-sincronia";
import { MetaSyncService } from "./meta-sync.service";

@Processor(META_SYNC_QUEUE)
export class MetaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(
    private readonly metaSyncService: MetaSyncService,
    private readonly agenda: AgendaDeSincronia,
  ) {
    super();
  }

  async process(job: Job<MetaSyncJob | Record<string, never>>): Promise<void> {
    // O job periódico não traz organização: ele só abre o leque, e cada
    // cliente vira um job próprio com a própria retentativa.
    if (job.name === SINCRONIA_PERIODICA) {
      await this.agenda.enfileirarTodas();
      return;
    }

    const { organizationId } = job.data as MetaSyncJob;

    try {
      const { limitadaAte } = await this.metaSyncService.sync(organizationId);

      // A Meta bloqueou: uma tentativa para quando o bloqueio acabar. Se era
      // essa a tentativa e ela também foi bloqueada, a de hora em hora
      // assume, e o bloqueio não vira um laço de erros.
      if (limitadaAte && job.name !== SINCRONIA_APOS_LIMITE) {
        await this.agenda.tentaDepoisDoLimite(organizationId, limitadaAte);
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({ event: "meta_sync_failed", jobId: job.id, error: (error as Error).message }),
      );
      throw error;
    }
  }
}
