import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  META_SYNC_QUEUE,
  SINCRONIA_APOS_LIMITE,
  SINCRONIA_DA_PAGINA,
  SINCRONIA_DE_UMA,
  SINCRONIA_PERIODICA,
} from "../common/queue/queue.constants";
import { MetaSyncJob } from "../common/queue/meta-sync.job";
import { mantemAgenda } from "./vigia-de-agenda";

/** Identificador da agenda no Redis. Fixo: é ele que faz o upsert substituir em vez de duplicar. */
const ID_DA_AGENDA = "meta-sync-periodica";

const INTERVALO_PADRAO_MINUTOS = 60;
/** Abaixo disto não é sincronizar, é martelar a API da Meta. */
const INTERVALO_MINIMO_MINUTOS = 5;

/**
 * Quem faz a sincronia da Meta acontecer sozinha.
 *
 * Antes disto nada agendava nada: o gasto das campanhas só era buscado ao
 * conectar a conta ou ao clicar em sincronizar. Quem conectava em setembro e
 * não clicava em mais nada seguia vendo o custo por lead de setembro, e o
 * número não tinha nenhuma marca de estar velho, o que é pior do que não ter
 * número nenhum.
 *
 * A agenda vive no Redis, e não num `setInterval` deste processo: assim ela
 * sobrevive a reinício, não dispara duas vezes quando houver dois workers, e
 * o próprio BullMQ garante que só uma execução acontece por intervalo.
 *
 * O relógio da vigia (`mantemAgenda`) não sincroniza nada: só confere se a
 * agenda continua no Redis e a registra de novo quando ela some.
 */
@Injectable()
export class AgendaDeSincronia implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgendaDeSincronia.name);
  private vigia?: { para(): void };

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(META_SYNC_QUEUE) private readonly fila: Queue<MetaSyncJob | Record<string, never>>,
  ) {}

  /**
   * Sem `await`: com o Redis fora, o BullMQ espera a conexão para sempre (sem
   * erro), e o Nest só abre a porta depois deste hook. A API ficava no ar sem
   * porta e o Render derrubava o deploy.
   */
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
    const minutos = this.intervaloEmMinutos();

    try {
      await this.fila.upsertJobScheduler(
        ID_DA_AGENDA,
        { every: minutos * 60_000 },
        {
          name: SINCRONIA_PERIODICA,
          data: {},
          // Sem retentativa: repetir um leque que falhou não adianta, porque
          // o próximo intervalo refaz o mesmo trabalho de qualquer jeito.
          opts: { attempts: 1, removeOnComplete: true, removeOnFail: 20 },
        },
      );
      this.logger.log(JSON.stringify({ event: "agenda_de_sincronia_registrada", minutos }));
    } catch (erro) {
      // Sem derrubar o worker: ele continua processando o que já está na
      // fila, e o Redis fora do ar já é um problema visível por si só.
      this.logger.error(JSON.stringify({ event: "agenda_de_sincronia_falhou", error: String(erro) }));
    }
  }

  /**
   * Enfileira uma sincronia por organização conectada.
   *
   * Um job por organização, e não um job que percorre todas: assim a falha de
   * um cliente não interrompe a sincronia dos outros, e cada um tem a própria
   * retentativa com o próprio recuo.
   */
  async enfileirarTodas(): Promise<number> {
    const conexoes = await this.prisma.metaConnection.findMany({
      // `TOKEN_EXPIRED` fica de fora de propósito: o acesso só volta quando
      // alguém reconecta na mão, e insistir de hora em hora com um token
      // morto só rende chamada recusada. `SYNC_FAILED` entra, porque falha
      // passageira é justamente o que uma nova tentativa resolve.
      //
      // A conta ainda bloqueada pela Meta também fica de fora: a tentativa
      // dela já está marcada para quando o bloqueio acabar.
      where: {
        status: { in: ["CONNECTED", "SYNC_FAILED"] },
        OR: [{ limitadaAte: null }, { limitadaAte: { lte: new Date() } }],
      },
      select: { organizationId: true },
    });

    for (const conexao of conexoes) {
      await this.fila.add(
        SINCRONIA_DE_UMA,
        { organizationId: conexao.organizationId },
        {
          // O id amarra a organização ao intervalo. Se um leque anterior ainda
          // estiver na fila quando o próximo disparar, o segundo não entra:
          // uma sincronia atrasada não deve virar duas empilhadas.
          jobId: `${SINCRONIA_DE_UMA}:${conexao.organizationId}:${this.janelaAtual()}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
    }

    this.logger.log(JSON.stringify({ event: "sincronia_periodica_enfileirada", organizacoes: conexoes.length }));
    return conexoes.length;
  }

  /**
   * Uma leitura dos Insights por Página escolhida.
   *
   * Sem olhar o bloqueio dos anúncios: a leitura da Página é outro limite na
   * Meta, e um bloqueio da conta de anúncios não diz nada sobre ela.
   */
  async enfileiraPaginas(): Promise<number> {
    const conexoes = await this.prisma.metaConnection.findMany({
      where: { paginaId: { not: null }, status: { in: ["CONNECTED", "SYNC_FAILED"] } },
      select: { organizationId: true },
    });

    for (const conexao of conexoes) {
      await this.fila.add(
        SINCRONIA_DA_PAGINA,
        { organizationId: conexao.organizationId },
        {
          jobId: `${SINCRONIA_DA_PAGINA}:${conexao.organizationId}:${this.janelaAtual()}`,
          attempts: 2,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
    }
    return conexoes.length;
  }

  /**
   * Uma tentativa para depois do bloqueio da Meta.
   *
   * O id amarra a organização ao minuto em que o bloqueio acaba: dois jobs
   * bloqueados ao mesmo tempo marcam uma tentativa só, e não duas chamando a
   * Meta juntas assim que ela liberar.
   */
  async tentaDepoisDoLimite(organizationId: string, limitadaAte: Date): Promise<void> {
    await this.fila.add(
      SINCRONIA_APOS_LIMITE,
      { organizationId },
      {
        delay: Math.max(0, limitadaAte.getTime() - Date.now()),
        jobId: `${SINCRONIA_APOS_LIMITE}:${organizationId}:${Math.floor(limitadaAte.getTime() / 60_000)}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 20,
      },
    );
    this.logger.log(
      JSON.stringify({ event: "meta_sync_depois_do_limite", organizationId, em: limitadaAte.toISOString() }),
    );
  }

  private intervaloEmMinutos(): number {
    const bruto = Number(process.env.META_SYNC_INTERVAL_MINUTES);
    if (!Number.isFinite(bruto) || bruto <= 0) return INTERVALO_PADRAO_MINUTOS;
    return Math.max(INTERVALO_MINIMO_MINUTOS, Math.floor(bruto));
  }

  /** Em que intervalo estamos, para o id do job mudar a cada rodada. */
  private janelaAtual(): number {
    return Math.floor(Date.now() / (this.intervaloEmMinutos() * 60_000));
  }
}
