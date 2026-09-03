import { Queue } from "bullmq";
import { HealthCheckService, PrismaHealthIndicator } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { ConexaoDeSaude } from "./conexao-de-saude";
import { PrismaService } from "../common/prisma/prisma.service";

describe("HealthController", () => {
  function filaFalsa(trabalhadores: number, contagens: Record<string, number> = {}) {
    return {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0, ...contagens }),
      getWorkers: jest.fn().mockResolvedValue(Array.from({ length: trabalhadores }, (_, i) => ({ id: `w${i}` }))),
    };
  }

  function montar(eventos = filaFalsa(1), sincronia = filaFalsa(1)) {
    const health = { check: jest.fn().mockResolvedValue({ status: "ok" }) };
    const prismaIndicator = { pingCheck: jest.fn() };
    const redis = { ping: jest.fn().mockResolvedValue(undefined) };
    const controller = new HealthController(
      health as unknown as HealthCheckService,
      prismaIndicator as unknown as PrismaHealthIndicator,
      {} as PrismaService,
      redis as unknown as ConexaoDeSaude,
      eventos as unknown as Queue,
      sincronia as unknown as Queue,
    );
    return { controller, health, redis, eventos, sincronia };
  }

  describe("filas", () => {
    it("diz quantos trabalhadores e quanto trabalho há em cada fila", async () => {
      const { controller } = montar(filaFalsa(1, { waiting: 4 }), filaFalsa(2, { delayed: 1 }));

      const resultado = await controller.filas();

      expect(resultado.processando).toBe(true);
      expect(resultado.filas[0]).toMatchObject({ nome: "whatsapp-events", trabalhadores: 1, esperando: 4 });
      expect(resultado.filas[1]).toMatchObject({ nome: "meta-sync", trabalhadores: 2, agendados: 1 });
    });

    it("acusa quando não há ninguém do outro lado", async () => {
      const { controller } = montar(filaFalsa(0), filaFalsa(0));

      // Um worker morto ficava invisível até um cliente reclamar que o lead
      // não apareceu. É este campo que vale um alerta.
      expect((await controller.filas()).processando).toBe(false);
    });

    it("responde mesmo com o Redis fora, em vez de virar erro", async () => {
      const quebrada = filaFalsa(0);
      quebrada.getJobCounts.mockRejectedValue(new Error("redis fora"));
      const { controller } = montar(quebrada, filaFalsa(1));

      const resultado = await controller.filas();

      // Esta é justamente a página onde se vai olhar quando algo está fora.
      expect(resultado.filas[0]).toMatchObject({ nome: "whatsapp-events", erro: "redis fora" });
      expect(resultado.processando).toBe(true);
    });
  });

  describe("check", () => {
    it("confere só o que a própria API precisa para atender", async () => {
      const { controller, health } = montar();

      await controller.check();

      // O worker é outro processo. Reprovar a API porque ele caiu faria um
      // orquestrador reiniciar quem está saudável.
      expect(health.check).toHaveBeenCalledWith([expect.any(Function), expect.any(Function)]);
    });

    it("reaproveita a mesma conexão de Redis a cada chamada", async () => {
      const { controller, health, redis } = montar();
      health.check.mockImplementation(async (verificacoes: (() => Promise<unknown>)[]) => {
        for (const verificar of verificacoes) await verificar();
        return { status: "ok" };
      });

      await controller.check();
      await controller.check();

      // Antes cada chamada abria um Redis novo e o descartava. Com o
      // monitoramento consultando sem parar, era uma conexão criada e
      // destruída por segundo, para sempre.
      expect(redis.ping).toHaveBeenCalledTimes(2);
    });
  });
});
