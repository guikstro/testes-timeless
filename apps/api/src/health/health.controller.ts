import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from "@nestjs/terminus";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck("postgres", this.prisma),
      () => this.checkRedis(),
    ]);
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await client.connect();
      await client.ping();
      return { redis: { status: "up" } };
    } catch (error) {
      throw new HealthCheckError("Redis check failed", {
        redis: { status: "down", message: (error as Error).message },
      });
    } finally {
      client.disconnect();
    }
  }
}
