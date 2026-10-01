import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { LEITURA_DO_PERFIL, LEITURA_DOS_PERFIS, PERFIL_DA_EMPRESA_QUEUE } from "../common/queue/queue.constants";
import { LeituraDoPerfilJob } from "../common/queue/perfil-da-empresa.job";
import { mantemAgenda } from "./vigia-de-agenda";

const ID_DA_AGENDA = "perfil-da-empresa-periodico";

/**
 * De seis em seis horas: o Google fecha os números do perfil uma vez por dia,
 * com uns três dias de atraso. Ler de hora em hora gastaria cota para trazer
 * o mesmo número.
 */
const INTERVALO_MS = 6 * 60 * 60 * 1000;

/**
 * Agenda a leitura do Perfil da Empresa, pelo mesmo caminho das outras:
 * repetição guardada no Redis e a vigia que a registra de novo quando o
 * Redis perde os dados.
 */
@Injectable()
export class AgendaDoPerfil implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgendaDoPerfil.name);
  private vigia?: { para(): void };

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PERFIL_DA_EMPRESA_QUEUE) private readonly fila: Queue<LeituraDoPerfilJob | Record<string, never>>,
  ) {}

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
        { name: LEITURA_DOS_PERFIS, data: {}, opts: { attempts: 1, removeOnComplete: true, removeOnFail: 20 } },
      );
      this.logger.log(JSON.stringify({ event: "agenda_do_perfil_registrada" }));
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "agenda_do_perfil_falhou", error: String(erro) }));
    }
  }

  /**
   * Uma leitura por cliente com perfil escolhido. Com a conta da equipe sem
   * acesso, nenhuma: cada uma só renderia a mesma recusa, e o aviso já está
   * na tela da equipe.
   */
  async enfileiraTodos(): Promise<number> {
    const conta = await this.prisma.contaGoogleDaEquipe.findUnique({ where: { id: "equipe" }, select: { erro: true } });
    if (!conta || conta.erro) return 0;

    const clientes = await this.prisma.localDoPerfil.findMany({ distinct: ["organizationId"], select: { organizationId: true } });
    const janela = Math.floor(Date.now() / INTERVALO_MS);
    for (const { organizationId } of clientes) {
      await this.fila.add(
        LEITURA_DO_PERFIL,
        { organizationId },
        {
          jobId: `${LEITURA_DO_PERFIL}:${organizationId}:${janela}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
    }
    this.logger.log(JSON.stringify({ event: "leitura_dos_perfis_enfileirada", clientes: clientes.length }));
    return clientes.length;
  }
}
