import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import Redis from "ioredis";
import { getRedisConnectionOptions } from "../queue/redis-connection";

/**
 * Contagem do limite de requisições no Redis, e não na memória do processo.
 *
 * Dois motivos, e os dois importam justamente na hora em que o limite serve
 * para alguma coisa:
 *
 * - Na memória, o contador zera a cada reinício da API. Quem está martelando
 *   o login ganharia uma cota nova a cada deploy, e o processo reinicia
 *   sozinho quando cai.
 * - Com mais de uma instância da API, cada uma contaria a sua parte, e o
 *   limite real viraria o dobro, o triplo, conforme a escala.
 *
 * O Redis já está no stack por causa do BullMQ, então isto não acrescenta
 * infraestrutura.
 */
const PREFIXO = "throttle:";

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(getRedisConnectionOptions());
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const contador = `${PREFIXO}${throttlerName}:${key}`;
    const bloqueio = `${PREFIXO}${throttlerName}:bloqueio:${key}`;

    // Quem já estourou fica bloqueado pelo tempo do castigo, sem nem contar a
    // tentativa: contar aqui deixaria o bloqueio se renovar sozinho a cada
    // requisição, e um cliente com retentativa automática nunca sairia dele.
    const restaDoBloqueio = await this.redis.pttl(bloqueio);
    if (restaDoBloqueio > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(restaDoBloqueio / 1000),
      };
    }

    // Incremento e leitura do prazo na mesma ida ao Redis.
    const resposta = await this.redis.multi().incr(contador).pttl(contador).exec();
    const totalHits = Number(resposta?.[0]?.[1] ?? 1);
    let restaDaJanela = Number(resposta?.[1]?.[1] ?? -1);

    // `-1` é chave sem prazo: acontece na primeira contagem e se algo apagar o
    // prazo no meio. Sem isto, o contador viveria para sempre e o limite se
    // tornaria permanente.
    if (restaDaJanela < 0) {
      await this.redis.pexpire(contador, ttl);
      restaDaJanela = ttl;
    }

    if (totalHits > limit) {
      /*
        Zera o contador junto com o bloqueio.

        Sem isso o contador estourado sobrevive ao castigo, e a primeira
        tentativa depois dele bloqueia de novo na hora: o castigo passaria a
        durar o tempo da janela, não o tempo configurado, e `blockDuration`
        viraria letra morta sempre que fosse menor que `ttl`.
      */
      await this.redis.multi().psetex(bloqueio, blockDuration, "1").del(contador).exec();
      return {
        totalHits,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(restaDaJanela / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
