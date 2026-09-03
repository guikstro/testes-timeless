import { Queue } from "bullmq";
import { AgendaDeSincronia } from "./agenda-de-sincronia";
import { PrismaService } from "../common/prisma/prisma.service";

describe("AgendaDeSincronia", () => {
  function montar(conexoes: { organizationId: string }[] = []) {
    const prisma = { metaConnection: { findMany: jest.fn().mockResolvedValue(conexoes) } };
    const fila = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined), add: jest.fn().mockResolvedValue(undefined) };
    const agenda = new AgendaDeSincronia(prisma as unknown as PrismaService, fila as unknown as Queue);
    return { agenda, prisma, fila };
  }

  afterEach(() => {
    delete process.env.META_SYNC_INTERVAL_MINUTES;
  });

  describe("registro da agenda", () => {
    it("registra a repetição de hora em hora por padrão", async () => {
      const { agenda, fila } = montar();

      await agenda.onApplicationBootstrap();

      expect(fila.upsertJobScheduler).toHaveBeenCalledWith(
        "meta-sync-periodica",
        { every: 60 * 60_000 },
        expect.objectContaining({ name: "sincronizar-todas" }),
      );
    });

    it("respeita o intervalo configurado", async () => {
      process.env.META_SYNC_INTERVAL_MINUTES = "30";
      const { agenda, fila } = montar();

      await agenda.onApplicationBootstrap();

      expect(fila.upsertJobScheduler).toHaveBeenCalledWith(
        "meta-sync-periodica",
        { every: 30 * 60_000 },
        expect.anything(),
      );
    });

    it("não aceita um intervalo que viraria martelo na API da Meta", async () => {
      process.env.META_SYNC_INTERVAL_MINUTES = "1";
      const { agenda, fila } = montar();

      await agenda.onApplicationBootstrap();

      expect(fila.upsertJobScheduler).toHaveBeenCalledWith(
        "meta-sync-periodica",
        { every: 5 * 60_000 },
        expect.anything(),
      );
    });

    it("volta ao padrão quando o valor configurado não é um número", async () => {
      process.env.META_SYNC_INTERVAL_MINUTES = "toda hora";
      const { agenda, fila } = montar();

      await agenda.onApplicationBootstrap();

      expect(fila.upsertJobScheduler).toHaveBeenCalledWith(
        "meta-sync-periodica",
        { every: 60 * 60_000 },
        expect.anything(),
      );
    });

    it("não derruba o worker quando o Redis recusa o registro", async () => {
      const { agenda, fila } = montar();
      fila.upsertJobScheduler.mockRejectedValue(new Error("redis fora"));

      // O worker continua processando o que já está na fila; um Redis fora do
      // ar já é visível por si só e não precisa de um processo morrendo junto.
      await expect(agenda.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe("leque por organização", () => {
    it("enfileira um job por conexão sincronizável", async () => {
      const { agenda, fila } = montar([{ organizationId: "org-1" }, { organizationId: "org-2" }]);

      const total = await agenda.enfileirarTodas();

      expect(total).toBe(2);
      expect(fila.add).toHaveBeenCalledTimes(2);
      expect(fila.add).toHaveBeenCalledWith("sync", { organizationId: "org-1" }, expect.any(Object));
      expect(fila.add).toHaveBeenCalledWith("sync", { organizationId: "org-2" }, expect.any(Object));
    });

    it("pede só as conexões que vale a pena tentar", async () => {
      const { agenda, prisma } = montar();

      await agenda.enfileirarTodas();

      // Um token expirado só volta quando alguém reconecta na mão: insistir de
      // hora em hora com ele só rende chamada recusada.
      expect(prisma.metaConnection.findMany).toHaveBeenCalledWith({
        where: { status: { in: ["CONNECTED", "SYNC_FAILED"] } },
        select: { organizationId: true },
      });
    });

    it("dá o mesmo id ao job da mesma organização dentro do mesmo intervalo", async () => {
      const { agenda, fila } = montar([{ organizationId: "org-1" }]);

      await agenda.enfileirarTodas();
      await agenda.enfileirarTodas();

      // Uma sincronia atrasada não pode virar duas empilhadas.
      const ids = fila.add.mock.calls.map((chamada) => (chamada[2] as { jobId: string }).jobId);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).toMatch(/^sync:org-1:\d+$/);
    });

    it("não enfileira nada quando ninguém tem a Meta conectada", async () => {
      const { agenda, fila } = montar([]);

      expect(await agenda.enfileirarTodas()).toBe(0);
      expect(fila.add).not.toHaveBeenCalled();
    });
  });
});
