import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { LEITURA_DOS_PERFIS, PERFIL_DA_EMPRESA_QUEUE } from "../../common/queue/queue.constants";
import { LeituraDoPerfilJob } from "../../common/queue/perfil-da-empresa.job";
import { AgendaDoPerfil } from "../agenda-do-perfil";
import { PerfilDaEmpresaSyncService } from "./perfil-da-empresa-sync.service";

@Processor(PERFIL_DA_EMPRESA_QUEUE)
export class PerfilDaEmpresaProcessor extends WorkerHost {
  private readonly logger = new Logger(PerfilDaEmpresaProcessor.name);

  constructor(
    private readonly agenda: AgendaDoPerfil,
    private readonly leitura: PerfilDaEmpresaSyncService,
  ) {
    super();
  }

  async process(job: Job<LeituraDoPerfilJob | Record<string, never>>): Promise<void> {
    // A rodada não traz cliente: só abre uma leitura para cada um.
    if (job.name === LEITURA_DOS_PERFIS) {
      await this.agenda.enfileiraTodos();
      return;
    }

    const { organizationId, dias } = job.data as LeituraDoPerfilJob;
    try {
      await this.leitura.sincroniza(organizationId, dias);
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "perfil_da_empresa_falhou", jobId: job.id, error: (erro as Error).message }));
      throw erro;
    }
  }
}
