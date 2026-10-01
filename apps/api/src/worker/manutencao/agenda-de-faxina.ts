import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import { FAXINA_PERIODICA, MANUTENCAO_QUEUE } from "../../common/queue/queue.constants";
import { mantemAgenda } from "../vigia-de-agenda";

const ID_DA_AGENDA = "faxina-periodica";

/** Uma vez por dia basta: o que ela apaga não incomoda ninguém enquanto espera. */
const INTERVALO_MS = 24 * 60 * 60 * 1000;

/**
 * Agenda a faxina, pelo mesmo caminho da sincronia: repetição guardada no
 * Redis, para sobreviver a reinício e não disparar duas vezes quando houver
 * mais de um worker, e a mesma vigia, para voltar sozinha quando o Redis
 * perde os dados.
 */
@Injectable()
export class AgendaDeFaxina implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgendaDeFaxina.name);
  private vigia?: { para(): void };

  constructor(@InjectQueue(MANUTENCAO_QUEUE) private readonly fila: Queue) {}

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
        { every: INTERVALO_MS },
        {
          name: FAXINA_PERIODICA,
          data: {},
          // Sem retentativa: o que sobrar é apagado amanhã, e insistir agora
          // só empilharia trabalho de banco em cima de um banco em apuros.
          opts: { attempts: 1, removeOnComplete: true, removeOnFail: 10 },
        },
      );
      this.logger.log(JSON.stringify({ event: "agenda_de_faxina_registrada" }));
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "agenda_de_faxina_falhou", error: String(erro) }));
    }
  }
}
