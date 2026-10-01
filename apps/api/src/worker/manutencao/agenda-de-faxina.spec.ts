import { Queue } from "bullmq";
import { AgendaDeFaxina } from "./agenda-de-faxina";
import { INTERVALO_DA_VIGIA_MS } from "../vigia-de-agenda";

describe("AgendaDeFaxina", () => {
  const montadas: AgendaDeFaxina[] = [];

  function montar() {
    const fila = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      getJobScheduler: jest.fn().mockResolvedValue({ key: "faxina-periodica" }),
    };
    const agenda = new AgendaDeFaxina(fila as unknown as Queue);
    montadas.push(agenda);
    return { agenda, fila };
  }

  afterEach(() => {
    montadas.splice(0).forEach((agenda) => agenda.onApplicationShutdown());
    jest.useRealTimers();
  });

  it("registra a faxina uma vez por dia, sem retentativa", async () => {
    const { agenda, fila } = montar();

    await agenda.registraAgenda();

    expect(fila.upsertJobScheduler).toHaveBeenCalledWith(
      "faxina-periodica",
      { every: 24 * 60 * 60 * 1000 },
      expect.objectContaining({ name: "faxina", opts: expect.objectContaining({ attempts: 1 }) }),
    );
  });

  it("registra de novo quando a faxina some do Redis, e para no desligamento", async () => {
    jest.useFakeTimers();
    const { agenda, fila } = montar();
    fila.getJobScheduler.mockResolvedValue(undefined);

    agenda.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS);

    expect(fila.getJobScheduler).toHaveBeenCalledWith("faxina-periodica");
    expect(fila.upsertJobScheduler).toHaveBeenCalledTimes(2);

    agenda.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS * 2);
    expect(fila.getJobScheduler).toHaveBeenCalledTimes(1);
  });
});
