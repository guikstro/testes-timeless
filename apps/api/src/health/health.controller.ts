import { Controller, Get } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { SkipThrottle } from "@nestjs/throttler";
import { Queue } from "bullmq";
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from "@nestjs/terminus";
import { PrismaService } from "../common/prisma/prisma.service";
import { META_SYNC_QUEUE, WHATSAPP_EVENTS_QUEUE } from "../common/queue/queue.constants";
import { ConexaoDeSaude } from "./conexao-de-saude";

/** O que a página de diagnóstico diz sobre uma fila. */
interface DetalheDaFila {
  nome: string;
  /** Quantos processos estão ouvindo esta fila. Zero significa que nada anda. */
  trabalhadores: number;
  esperando?: number;
  emExecucao?: number;
  agendados?: number;
  falhos?: number;
  /** Preenchido quando nem deu para perguntar ao Redis. */
  erro?: string;
}

// O monitoramento consulta isto o tempo todo; limitar seria criar alarme falso.
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: ConexaoDeSaude,
    @InjectQueue(WHATSAPP_EVENTS_QUEUE) private readonly filaDeEventos: Queue,
    @InjectQueue(META_SYNC_QUEUE) private readonly filaDeSincronia: Queue,
  ) {}

  /**
   * Este processo consegue atender?
   *
   * Só o que a API precisa para responder: banco e Redis. O worker de
   * propósito não entra aqui — ele é outro processo, e reprovar a API porque
   * o worker caiu faria um orquestrador reiniciar quem está saudável.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck("postgres", this.prisma),
      () => this.checkRedis(),
    ]);
  }

  /**
   * As filas estão andando, e alguém está do outro lado?
   *
   * Separado do `/health` e sempre 200, de propósito. É informação para painel
   * e alerta, não um veredito sobre este processo: um worker morto não é
   * motivo para reiniciar a API, mas é exatamente o tipo de coisa que ficava
   * invisível até um cliente reclamar que o lead não apareceu.
   */
  @Get("filas")
  async filas() {
    const filas = [
      { nome: WHATSAPP_EVENTS_QUEUE, fila: this.filaDeEventos },
      { nome: META_SYNC_QUEUE, fila: this.filaDeSincronia },
    ];

    const detalhes: DetalheDaFila[] = await Promise.all(
      filas.map(async ({ nome, fila }): Promise<DetalheDaFila> => {
        try {
          const [contagens, trabalhadores] = await Promise.all([
            fila.getJobCounts("waiting", "active", "delayed", "failed"),
            fila.getWorkers(),
          ]);
          return {
            nome,
            trabalhadores: trabalhadores.length,
            esperando: contagens.waiting ?? 0,
            emExecucao: contagens.active ?? 0,
            agendados: contagens.delayed ?? 0,
            falhos: contagens.failed ?? 0,
          };
        } catch (erro) {
          // Redis fora não pode transformar a página de diagnóstico em erro:
          // ela é justamente onde se vai olhar quando algo está fora.
          return { nome, trabalhadores: 0, erro: (erro as Error).message };
        }
      }),
    );

    return {
      // Sem nenhum trabalhador em nenhuma fila, nada está sendo processado.
      // É o resumo que vale um alerta.
      processando: detalhes.some((detalhe) => detalhe.trabalhadores > 0),
      filas: detalhes,
    };
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return { redis: { status: "up" } };
    } catch (error) {
      throw new HealthCheckError("Redis check failed", {
        redis: { status: "down", message: (error as Error).message },
      });
    }
  }
}
