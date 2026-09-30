import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  EMAIL_QUEUE,
  MANUTENCAO_QUEUE,
  META_CONVERSIONS_QUEUE,
  META_SYNC_QUEUE,
  WHATSAPP_EVENTS_QUEUE,
  WHATSAPP_SEND_QUEUE,
} from "../common/queue/queue.constants";
import { MetricasDaApi } from "./metricas-da-api";

/** O script do Google roda de hora em hora; três horas sem envio é sinal de que parou. */
const GOOGLE_ATRASADO_MS = 3 * 60 * 60 * 1000;
/** Tempo que uma primeira sincronia da Meta tem para terminar antes de virar problema. */
const PRIMEIRA_SINCRONIA_MS = 15 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const INICIO_DO_PROCESSO = new Date();

/** Uma parte que não deu para medir diz o porquê, em vez de derrubar a tela inteira. */
type Parte<T> = T | { erro: string };

async function seguro<T>(medir: () => Promise<T>): Promise<Parte<T>> {
  try {
    return await medir();
  } catch (erro) {
    return { erro: (erro as Error).message.slice(0, 300) };
  }
}

async function cronometra(acao: () => Promise<unknown>): Promise<{ ok: true; ms: number }> {
  const inicio = performance.now();
  await acao();
  return { ok: true, ms: Math.round(performance.now() - inicio) };
}

/**
 * Tudo o que a equipe precisa para saber se a plataforma está bem, numa
 * chamada: o processo, o banco, o Redis, as filas com as últimas falhas, cada
 * integração com quem está quebrado, os pedidos da última hora e os erros.
 *
 * Só leitura, e só números e nomes de cliente: nenhum token, nenhum dado de
 * lead. É o que o operador de suporte já veria entrando em cada cliente.
 */
@Injectable()
export class SaudeDaPlataformaService {
  private readonly filas: Queue[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricas: MetricasDaApi,
    @InjectQueue(WHATSAPP_EVENTS_QUEUE) eventos: Queue,
    @InjectQueue(WHATSAPP_SEND_QUEUE) envios: Queue,
    @InjectQueue(META_SYNC_QUEUE) sincronia: Queue,
    @InjectQueue(META_CONVERSIONS_QUEUE) conversoes: Queue,
    @InjectQueue(EMAIL_QUEUE) email: Queue,
    @InjectQueue(MANUTENCAO_QUEUE) manutencao: Queue,
  ) {
    this.filas = [eventos, envios, sincronia, conversoes, email, manutencao];
  }

  async resumo(agora = new Date()) {
    const [banco, redis, filas, whatsapp, meta, google, capi, erros] = await Promise.all([
      seguro(() => cronometra(() => this.prisma.$queryRaw`SELECT 1`)),
      seguro(async () => {
        // O mesmo Redis das filas: se ele não responde, é isto que para.
        const cliente = (await this.filas[0].client) as unknown as { ping(): Promise<string> };
        return cronometra(() => cliente.ping());
      }),
      seguro(() => Promise.all(this.filas.map((fila) => this.fila(fila)))),
      seguro(() => this.whatsapp()),
      seguro(() => this.meta(agora)),
      seguro(() => this.google(agora)),
      seguro(() => this.capi(agora)),
      seguro(() => this.erros(agora)),
    ]);

    const memoria = process.memoryUsage();
    return {
      geradoEm: agora.toISOString(),
      api: {
        commit: process.env.RENDER_GIT_COMMIT ?? null,
        iniciadaEm: INICIO_DO_PROCESSO.toISOString(),
        node: process.version,
        memoriaMb: { total: Math.round(memoria.rss / 1_048_576), heap: Math.round(memoria.heapUsed / 1_048_576) },
      },
      banco,
      redis,
      requisicoes: this.metricas.resumo(agora.getTime()),
      filas,
      integracoes: { whatsapp, meta, google, capi },
      erros,
    };
  }

  private async fila(fila: Queue) {
    const [contagem, trabalhadores, falhas] = await Promise.all([
      fila.getJobCounts("waiting", "active", "delayed", "failed"),
      fila.getWorkersCount(),
      fila.getJobs(["failed"], 0, 4),
    ]);
    return {
      nome: fila.name,
      trabalhadores,
      esperando: contagem.waiting ?? 0,
      emExecucao: contagem.active ?? 0,
      agendados: contagem.delayed ?? 0,
      falhos: contagem.failed ?? 0,
      ultimasFalhas: falhas
        .filter(Boolean)
        .map((job) => ({
          trabalho: job.name,
          motivo: (job.failedReason ?? "sem motivo registrado").slice(0, 300),
          quando: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          tentativas: job.attemptsMade,
        })),
    };
  }

  private async whatsapp() {
    const conexoes = await this.prisma.whatsAppConnection.findMany({
      where: { organization: { deletedAt: null } },
      select: {
        status: true,
        provider: true,
        lastEventAt: true,
        disconnectedAt: true,
        updatedAt: true,
        organization: { select: { name: true } },
      },
    });
    const ultimoEvento = conexoes.reduce<Date | null>(
      (maior, c) => (c.lastEventAt && (!maior || c.lastEventAt > maior) ? c.lastEventAt : maior),
      null,
    );
    return {
      total: conexoes.length,
      conectados: conexoes.filter((c) => c.status === "CONNECTED").length,
      ultimoEventoEm: ultimoEvento?.toISOString() ?? null,
      problemas: conexoes
        .filter((c) => c.status !== "CONNECTED")
        .map((c) => ({
          cliente: c.organization.name,
          situacao: c.status === "PENDING_QR" ? "aguardando leitura do QR" : "desconectado",
          desde: (c.disconnectedAt ?? c.updatedAt).toISOString(),
        })),
    };
  }

  private async meta(agora: Date) {
    const conexoes = await this.prisma.metaConnection.findMany({
      where: { organization: { deletedAt: null }, status: { not: "DISCONNECTED" } },
      select: {
        status: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastSyncError: true,
        organization: { select: { name: true } },
      },
    });
    const ultima = conexoes.reduce<Date | null>(
      (maior, c) => (c.lastSyncedAt && (!maior || c.lastSyncedAt > maior) ? c.lastSyncedAt : maior),
      null,
    );

    /*
      Conectada não quer dizer sincronizando.

      Só o status contava aqui, e uma conta recém-conectada que batia no limite
      da Meta, ou cuja primeira sincronia nunca terminava, aparecia como "1 de 1
      sincronizando" enquanto o cliente via a tela vazia. Os dois casos entram
      como problema agora, com o motivo quando há um.
    */
    const situacaoDe = (c: (typeof conexoes)[number]): string | null => {
      if (c.status === "TOKEN_EXPIRED") return "token expirado";
      if (c.status !== "CONNECTED") return "falha na sincronização";
      if (c.lastSyncError) return "limitada pela Meta";
      if (!c.lastSyncedAt && agora.getTime() - c.connectedAt.getTime() > PRIMEIRA_SINCRONIA_MS) {
        return "primeira sincronia não terminou";
      }
      return null;
    };

    const problemas = conexoes.flatMap((c) => {
      const situacao = situacaoDe(c);
      if (!situacao) return [];
      return [
        {
          cliente: c.organization.name,
          situacao,
          erro: c.lastSyncError?.slice(0, 300) ?? null,
          ultimaSincroniaEm: c.lastSyncedAt?.toISOString() ?? null,
        },
      ];
    });

    return {
      total: conexoes.length,
      sincronizando: conexoes.length - problemas.length,
      ultimaSincroniaEm: ultima?.toISOString() ?? null,
      problemas,
    };
  }

  private async google(agora: Date) {
    const conexoes = await this.prisma.googleAdsConexao.findMany({
      where: { organization: { deletedAt: null } },
      select: { ultimoEnvioEm: true, criadaEm: true, organization: { select: { name: true } } },
    });
    const limite = agora.getTime() - GOOGLE_ATRASADO_MS;
    return {
      total: conexoes.length,
      problemas: conexoes
        .filter((c) => (c.ultimoEnvioEm ?? c.criadaEm).getTime() < limite)
        .map((c) => ({
          cliente: c.organization.name,
          situacao: c.ultimoEnvioEm ? "script sem enviar há mais de 3 horas" : "script nunca enviou",
          ultimoEnvioEm: c.ultimoEnvioEm?.toISOString() ?? null,
        })),
    };
  }

  private async capi(agora: Date) {
    const desde = new Date(agora.getTime() - DIA_MS);
    const [porStatus, falhas] = await Promise.all([
      this.prisma.conversionEvent.groupBy({
        by: ["status"],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
      }),
      this.prisma.conversionEvent.findMany({
        where: { status: "FAILED", updatedAt: { gte: desde } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { type: true, lastError: true, updatedAt: true, organization: { select: { name: true } } },
      }),
    ]);
    const conta = (status: string) => porStatus.find((linha) => linha.status === status)?._count._all ?? 0;
    return {
      ultimas24h: { enviados: conta("SENT"), tentando: conta("PENDING") + conta("RETRYING"), falhos: conta("FAILED") },
      ultimasFalhas: falhas.map((f) => ({
        cliente: f.organization.name,
        evento: f.type,
        erro: f.lastError?.slice(0, 300) ?? null,
        quando: f.updatedAt.toISOString(),
      })),
    };
  }

  private async erros(agora: Date) {
    const [abertos, ultimas24h] = await Promise.all([
      this.prisma.erroDaPlataforma.count({ where: { resolvidoEm: null } }),
      this.prisma.erroDaPlataforma.count({ where: { ultimaEm: { gte: new Date(agora.getTime() - DIA_MS) } } }),
    ]);
    return { abertos, ultimas24h };
  }
}
