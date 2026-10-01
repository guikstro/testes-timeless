import { Logger } from "@nestjs/common";
import { INTERVALO_DA_VIGIA_MS, mantemAgenda, vigiaAgenda } from "./vigia-de-agenda";

describe("vigia de agenda", () => {
  const ligadas: { para(): void }[] = [];

  function montar({ agendaNoRedis = true } = {}) {
    const fila = { getJobScheduler: jest.fn().mockResolvedValue(agendaNoRedis ? { key: "agenda" } : undefined) };
    const registra = jest.fn().mockResolvedValue(undefined);
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    return { fila, registra, logger, opcoes: { fila, id: "agenda", registra, logger } };
  }

  function guarda<T extends { para(): void }>(ligada: T): T {
    ligadas.push(ligada);
    return ligada;
  }

  afterEach(() => {
    ligadas.splice(0).forEach((ligada) => ligada.para());
    jest.useRealTimers();
  });

  describe("conferência", () => {
    it("não mexe numa agenda que continua no Redis", async () => {
      const { opcoes, fila, registra } = montar();

      await guarda(vigiaAgenda(opcoes)).confere();

      expect(fila.getJobScheduler).toHaveBeenCalledWith("agenda");
      // Registrar por cima de uma agenda viva mexeria no job que espera a vez.
      expect(registra).not.toHaveBeenCalled();
    });

    it("registra de novo a agenda que sumiu", async () => {
      const { opcoes, registra, logger } = montar({ agendaNoRedis: false });

      await guarda(vigiaAgenda(opcoes)).confere();

      expect(registra).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("agenda_sumiu_do_redis"));
    });

    it("não empilha conferências enquanto o Redis não responde", () => {
      const { opcoes, fila } = montar();
      // Com o Redis fora, o BullMQ não recusa: espera para sempre.
      fila.getJobScheduler.mockReturnValue(new Promise(() => {}));
      const vigia = guarda(vigiaAgenda(opcoes));

      void vigia.confere();
      void vigia.confere();

      expect(fila.getJobScheduler).toHaveBeenCalledTimes(1);
    });

    it("uma consulta que falha não derruba nada, e a próxima volta ao normal", async () => {
      const { opcoes, fila, registra, logger } = montar({ agendaNoRedis: false });
      fila.getJobScheduler.mockRejectedValueOnce(new Error("redis fora"));
      const vigia = guarda(vigiaAgenda(opcoes));

      await expect(vigia.confere()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("vigia_de_agenda_falhou"));

      await vigia.confere();
      expect(registra).toHaveBeenCalledTimes(1);
    });
  });

  describe("relógio", () => {
    it("confere sozinha a cada intervalo, e para quando pedido", async () => {
      jest.useFakeTimers();
      const { opcoes, fila } = montar();
      const vigia = guarda(vigiaAgenda(opcoes));

      expect(fila.getJobScheduler).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS * 2);
      expect(fila.getJobScheduler).toHaveBeenCalledTimes(2);

      vigia.para();
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS * 3);
      expect(fila.getJobScheduler).toHaveBeenCalledTimes(2);
    });
  });

  describe("registro da subida", () => {
    it("só liga a vigia depois que o registro da subida termina", async () => {
      jest.useFakeTimers();
      const { opcoes, fila, registra } = montar({ agendaNoRedis: false });
      let terminaRegistro!: () => void;
      registra.mockReturnValueOnce(new Promise<void>((resolve) => (terminaRegistro = resolve)));

      guarda(mantemAgenda(opcoes));
      expect(registra).toHaveBeenCalledTimes(1);

      // Registro pendurado, como fica com o Redis mudo: nada de conferência.
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS * 3);
      expect(fila.getJobScheduler).not.toHaveBeenCalled();

      terminaRegistro();
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS);
      expect(fila.getJobScheduler).toHaveBeenCalledTimes(1);
      expect(registra).toHaveBeenCalledTimes(2);
    });

    it("liga a vigia mesmo quando o registro da subida falha", async () => {
      jest.useFakeTimers();
      const { opcoes, fila, registra } = montar({ agendaNoRedis: false });
      registra.mockRejectedValueOnce(new Error("redis recusou"));

      guarda(mantemAgenda(opcoes));
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS);

      // É a vigia quem tenta de novo; antes, só o próximo deploy tentava.
      expect(fila.getJobScheduler).toHaveBeenCalledTimes(1);
      expect(registra).toHaveBeenCalledTimes(2);
    });

    it("não liga a vigia quando a API desliga antes de o registro terminar", async () => {
      jest.useFakeTimers();
      const { opcoes, fila, registra } = montar({ agendaNoRedis: false });
      let terminaRegistro!: () => void;
      registra.mockReturnValueOnce(new Promise<void>((resolve) => (terminaRegistro = resolve)));

      mantemAgenda(opcoes).para();
      terminaRegistro();
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS * 2);

      expect(fila.getJobScheduler).not.toHaveBeenCalled();
    });

    it("para a vigia no desligamento", async () => {
      jest.useFakeTimers();
      const { opcoes, fila } = montar();
      const agenda = mantemAgenda(opcoes);

      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS);
      expect(fila.getJobScheduler).toHaveBeenCalledTimes(1);

      agenda.para();
      await jest.advanceTimersByTimeAsync(INTERVALO_DA_VIGIA_MS * 2);
      expect(fila.getJobScheduler).toHaveBeenCalledTimes(1);
    });
  });
});
