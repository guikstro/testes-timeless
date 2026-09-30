import { BLOQUEIO_PADRAO_S, liberadaEm, segundosAteLiberar } from "./limite-da-meta";

function cabecalhos(valores: Record<string, string>) {
  return { get: (nome: string) => valores[nome.toLowerCase()] ?? null };
}

describe("segundosAteLiberar", () => {
  it("lê a espera por caso de uso, que a Meta dá em minutos", () => {
    const porCasoDeUso = JSON.stringify({
      "66782684": [{ type: "ads_management", call_count: 100, estimated_time_to_regain_access: 19 }],
    });
    expect(segundosAteLiberar(cabecalhos({ "x-business-use-case-usage": porCasoDeUso }))).toBe(19 * 60);
  });

  it("lê a espera da conta de anúncios, que a Meta dá em segundos", () => {
    const daConta = JSON.stringify({ acc_id_util_pct: 100, reset_time_duration: 280, ads_api_access_tier: "development_access" });
    expect(segundosAteLiberar(cabecalhos({ "x-ad-account-usage": daConta }))).toBe(280);
  });

  it("com os dois, vale o maior: liberar um limite não adianta com o outro fechado", () => {
    const valores = {
      "x-business-use-case-usage": JSON.stringify({ "1": [{ estimated_time_to_regain_access: 2 }] }),
      "x-ad-account-usage": JSON.stringify({ reset_time_duration: 280 }),
    };
    expect(segundosAteLiberar(cabecalhos(valores))).toBe(280);
  });

  it("sem cabeçalho, com cabeçalho quebrado ou sem espera, não inventa número", () => {
    expect(segundosAteLiberar(undefined)).toBeNull();
    expect(segundosAteLiberar(cabecalhos({}))).toBeNull();
    expect(segundosAteLiberar(cabecalhos({ "x-ad-account-usage": "{não é json" }))).toBeNull();
    expect(
      segundosAteLiberar(cabecalhos({ "x-business-use-case-usage": JSON.stringify({ "1": [{ call_count: 12 }] }) })),
    ).toBeNull();
  });
});

describe("liberadaEm", () => {
  const agora = new Date("2026-09-30T19:00:00.000Z");
  const minutosDepois = (data: Date) => (data.getTime() - agora.getTime()) / 60_000;

  it("sem a Meta dizer, espera o bloqueio padrão e mais um minuto", () => {
    expect(minutosDepois(liberadaEm(agora, null))).toBe(BLOQUEIO_PADRAO_S / 60 + 1);
  });

  /*
    O saldo pode voltar antes de o bloqueio acabar, e a Meta recusa do mesmo
    jeito até lá. Tentar antes renovaria o bloqueio.
  */
  it("nunca tenta antes do bloqueio padrão, mesmo que o cabeçalho diga menos", () => {
    expect(minutosDepois(liberadaEm(agora, 30))).toBe(6);
  });

  it("espera o que a Meta disser quando ela pede mais", () => {
    expect(minutosDepois(liberadaEm(agora, 19 * 60))).toBe(20);
  });

  it("não aceita uma espera absurda, que seria defeito do cabeçalho", () => {
    expect(minutosDepois(liberadaEm(agora, 10 * 24 * 60 * 60))).toBe(6 * 60 + 1);
  });
});
