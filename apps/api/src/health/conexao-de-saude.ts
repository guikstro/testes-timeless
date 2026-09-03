import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { getRedisConnectionOptions } from "../common/queue/redis-connection";

/**
 * Uma conexão só, reaproveitada, para a checagem de saúde.
 *
 * Antes cada chamada abria um Redis novo e o descartava no `finally`. Como o
 * monitoramento consulta isto sem parar, era uma conexão criada e destruída
 * por segundo, indefinidamente: a checagem que existe para dizer se o sistema
 * está bem era ela mesma uma fonte constante de trabalho inútil, e num pico
 * de checagens ela contribuía para o problema que deveria observar.
 *
 * O ioredis reconecta sozinho, então uma conexão de longa vida é justamente o
 * que dá a resposta certa: se ela está fora, o `ping` falha.
 */
@Injectable()
export class ConexaoDeSaude implements OnModuleDestroy {
  private readonly cliente: Redis;

  constructor() {
    this.cliente = new Redis(getRedisConnectionOptions());
  }

  async ping(): Promise<void> {
    await this.cliente.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.cliente.quit();
  }
}
