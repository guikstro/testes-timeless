import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import { RELATORIO_DE_TODAS, RELATORIO_QUEUE } from "../../common/queue/queue.constants";
import { mantemAgenda } from "../vigia-de-agenda";
import { RelatorioSemanalService } from "./relatorio-semanal.service";

const ID_DA_AGENDA = "relatorio-semanal";

/**
 * Toda segunda às 8h de Brasília, pelo mesmo caminho das outras agendas:
 * repetição guardada no Redis, e a vigia que a registra de novo se o Redis
 * perder os dados. Uma hora marcada, e não um intervalo, porque o resumo
 * precisa chegar na mesma manhã toda semana.
 */
@Injectable()
export class AgendaDoRelatorio implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgendaDoRelatorio.name);
  private vigia?: { para(): void };

  constructor(@InjectQueue(RELATORIO_QUEUE) private readonly fila: Queue) {}

  /** Sem `await`, pelo mesmo motivo da `AgendaDeSincronia`: Redis fora não pode segurar a porta. */
  onApplicationBootstrap(): void {
    this.vigia = mantemAgenda({
      fila: this.fila,
      id: ID_DA_AGENDA,
      registra: () => this.registraAgenda(),
      logger: this.logger,
    });
  }

  onApplicationShutdown(): void {
    this.vigia?.para();
  }

  async registraAgenda(): Promise<void> {
    try {
      await this.fila.upsertJobScheduler(
        ID_DA_AGENDA,
        { pattern: "0 8 * * 1", tz: "America/Sao_Paulo" },
        {
          name: RELATORIO_DE_TODAS,
          data: {},
          // Sem retentativa: repetir mandaria o resumo duas vezes a quem já recebeu.
          opts: { attempts: 1, removeOnComplete: true, removeOnFail: 10 },
        },
      );
      this.logger.log(JSON.stringify({ event: "agenda_do_relatorio_registrada" }));
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "agenda_do_relatorio_falhou", error: String(erro) }));
    }
  }
}

@Processor(RELATORIO_QUEUE)
export class RelatorioSemanalProcessor extends WorkerHost {
  constructor(private readonly relatorio: RelatorioSemanalService) {
    super();
  }

  async process(): Promise<void> {
    await this.relatorio.enviarParaTodas();
  }
}
