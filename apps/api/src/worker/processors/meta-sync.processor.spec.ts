import { Job } from "bullmq";
import { MetaSyncProcessor } from "./meta-sync.processor";
import { MetaSyncService, ResultadoDaSincronia } from "./meta-sync.service";
import { AgendaDeSincronia } from "../agenda-de-sincronia";
import { PaginaSyncService } from "./pagina-sync.service";

describe("MetaSyncProcessor", () => {
  function montar(resultado: ResultadoDaSincronia | Error) {
    const service = {
      sync: resultado instanceof Error ? jest.fn().mockRejectedValue(resultado) : jest.fn().mockResolvedValue(resultado),
    };
    const agenda = {
      enfileirarTodas: jest.fn(),
      enfileiraPaginas: jest.fn(),
      tentaDepoisDoLimite: jest.fn().mockResolvedValue(undefined),
    };
    const paginaSync = { sincroniza: jest.fn().mockResolvedValue(undefined) };
    const processor = new MetaSyncProcessor(
      service as unknown as MetaSyncService,
      agenda as unknown as AgendaDeSincronia,
      paginaSync as unknown as PaginaSyncService,
    );
    return { processor, service, agenda, paginaSync };
  }

  const job = (name: string) => ({ name, id: "1", data: { organizationId: "org-1" } }) as unknown as Job;
  const ate = new Date(Date.now() + 6 * 60_000);

  it("marca uma tentativa para depois do bloqueio da Meta", async () => {
    const { processor, agenda } = montar({ limitadaAte: ate });

    await processor.process(job("sync"));

    expect(agenda.tentaDepoisDoLimite).toHaveBeenCalledWith("org-1", ate);
  });

  /*
    A tentativa depois do bloqueio também pode ser bloqueada. Marcar outra
    a partir dela viraria um laço de erros a cada seis minutos; quem assume é
    a sincronia de hora em hora.
  */
  it("não marca outra quando a própria tentativa depois do bloqueio é bloqueada", async () => {
    const { processor, agenda } = montar({ limitadaAte: ate });

    await processor.process(job("sincronia-apos-limite"));

    expect(agenda.tentaDepoisDoLimite).not.toHaveBeenCalled();
  });

  it("sem bloqueio, não marca nada", async () => {
    const { processor, agenda } = montar({ limitadaAte: null });

    await processor.process(job("sync"));

    expect(agenda.tentaDepoisDoLimite).not.toHaveBeenCalled();
  });

  it("um erro de verdade continua sendo lançado, para o BullMQ tentar de novo", async () => {
    const { processor, agenda } = montar(new Error("rede fora"));

    await expect(processor.process(job("sync"))).rejects.toThrow("rede fora");
    expect(agenda.tentaDepoisDoLimite).not.toHaveBeenCalled();
  });

  it("o job periódico só abre o leque, dos anúncios e das Páginas, sem sincronizar ninguém", async () => {
    const { processor, service, agenda } = montar({ limitadaAte: null });

    await processor.process({ name: "sincronizar-todas", id: "2", data: {} } as unknown as Job);

    expect(agenda.enfileirarTodas).toHaveBeenCalled();
    expect(agenda.enfileiraPaginas).toHaveBeenCalled();
    expect(service.sync).not.toHaveBeenCalled();
  });

  /*
    A leitura da Página é outro limite de uso na Meta: ela vai para o próprio
    serviço, e nunca para a sincronia dos anúncios.
  */
  it("manda a leitura da Página para o serviço da Página, com os dias pedidos", async () => {
    const { processor, service, paginaSync } = montar({ limitadaAte: null });

    await processor.process({ name: "sincronia-da-pagina", id: "3", data: { organizationId: "org-1", dias: 89 } } as unknown as Job);

    expect(paginaSync.sincroniza).toHaveBeenCalledWith("org-1", 89);
    expect(service.sync).not.toHaveBeenCalled();
  });
});
