import { frescorDaMeta, frescorDoGoogle } from "./frescor";

const agora = new Date("2026-09-29T15:00:00.000Z");
const ha = (horas: number) => new Date(agora.getTime() - horas * 60 * 60 * 1000);

describe("frescor dos dados", () => {
  it("sem conexão, a fonte não aparece", () => {
    expect(frescorDaMeta(null, agora)).toBeNull();
    expect(frescorDoGoogle(null, agora)).toBeNull();
  });

  it("Meta desligada de propósito não é dado velho", () => {
    expect(frescorDaMeta({ status: "DISCONNECTED", lastSyncedAt: ha(48) }, agora)).toBeNull();
  });

  it("em dia até 3 horas; depois, atrasada", () => {
    expect(frescorDoGoogle({ ultimoEnvioEm: ha(2.9) }, agora)?.estado).toBe("em-dia");
    expect(frescorDoGoogle({ ultimoEnvioEm: ha(3.1) }, agora)?.estado).toBe("atrasada");
    expect(frescorDaMeta({ status: "CONNECTED", lastSyncedAt: ha(1) }, agora)).toEqual({
      estado: "em-dia",
      atualizadoEm: ha(1).toISOString(),
      motivo: null,
    });
    expect(frescorDaMeta({ status: "CONNECTED", lastSyncedAt: ha(5) }, agora)?.estado).toBe("atrasada");
  });

  it("nunca chegou: atrasada, sem data", () => {
    expect(frescorDoGoogle({ ultimoEnvioEm: null }, agora)).toMatchObject({ estado: "atrasada", atualizadoEm: null });
    expect(frescorDaMeta({ status: "CONNECTED", lastSyncedAt: null }, agora)).toMatchObject({ estado: "atrasada", atualizadoEm: null });
  });

  it("token vencido ou sincronia com erro é falha, mesmo com a última sincronia recente", () => {
    expect(frescorDaMeta({ status: "TOKEN_EXPIRED", lastSyncedAt: ha(0.5) }, agora)?.estado).toBe("falha");
    expect(frescorDaMeta({ status: "SYNC_FAILED", lastSyncedAt: ha(0.5) }, agora)?.estado).toBe("falha");
  });

  it("a falha diz o motivo gravado, quando há um", () => {
    expect(
      frescorDaMeta({ status: "SYNC_FAILED", lastSyncedAt: null, lastSyncError: "A Meta não encontrou act_1." }, agora),
    ).toMatchObject({ estado: "falha", motivo: "A Meta não encontrou act_1." });
  });

  /*
    Conectada e com motivo gravado é a Meta limitando as chamadas. Tenta de
    novo sozinho, então é atraso e não falha, mas a tela diz o porquê.
  */
  it("conectada com motivo gravado é atraso com o motivo, e não só 'sem dado'", () => {
    const motivo = "A Meta limitou as chamadas desta conta.";
    expect(frescorDaMeta({ status: "CONNECTED", lastSyncedAt: null, lastSyncError: motivo }, agora)).toEqual({
      estado: "atrasada",
      atualizadoEm: null,
      motivo,
    });
  });

  it("a primeira sincronia que não terminou diz onde tentar de novo", () => {
    expect(frescorDaMeta({ status: "CONNECTED", lastSyncedAt: null }, agora)?.motivo).toContain("Sincronizar agora");
  });
});
