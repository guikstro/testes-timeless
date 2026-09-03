import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to PostgreSQL");
  }

  async onModuleDestroy(): Promise<void> {
    // Registrado, e não silencioso: esta linha é a prova, no log, de que o
    // processo saiu com ordem em vez de ter sido morto no meio. Sem ela, um
    // desligamento limpo e um `kill -9` são indistinguíveis de fora.
    this.logger.log("Disconnecting from PostgreSQL");
    await this.$disconnect();
  }
}
