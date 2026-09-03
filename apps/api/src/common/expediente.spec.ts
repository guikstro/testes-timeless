import { Expediente, segundosDeExpediente } from "./expediente";

const COMERCIAL: Expediente = {
  ativo: true,
  dias: [1, 2, 3, 4, 5],
  inicioMinutos: 9 * 60,
  fimMinutos: 18 * 60,
  fuso: "America/Sao_Paulo",
};

/** Horário de Brasília escrito como instante. */
const em = (iso: string) => new Date(`${iso}-03:00`);
const minutos = (segundos: number) => Math.round(segundos / 60);

describe("segundosDeExpediente", () => {
  it("devolve o relógio corrido quando está desligado", () => {
    const total = segundosDeExpediente(
      em("2026-09-02T23:00:00"),
      em("2026-09-03T09:10:00"),
      { ...COMERCIAL, ativo: false },
    );
    expect(minutos(total!)).toBe(610);
  });

  it("desconta a madrugada", () => {
    // Quarta 23h até quinta 9h10. Fora do expediente inteiro, menos dez
    // minutos: é o caso que fazia o número mentir.
    const total = segundosDeExpediente(em("2026-09-02T23:00:00"), em("2026-09-03T09:10:00"), COMERCIAL);
    expect(minutos(total!)).toBe(10);
  });

  it("conta normalmente dentro do expediente", () => {
    const total = segundosDeExpediente(em("2026-09-02T10:00:00"), em("2026-09-02T10:45:00"), COMERCIAL);
    expect(minutos(total!)).toBe(45);
  });

  it("soma só as horas úteis quando atravessa a noite", () => {
    // Quarta 17h30 até quinta 9h30: meia hora antes de fechar mais meia hora
    // depois de abrir.
    const total = segundosDeExpediente(em("2026-09-02T17:30:00"), em("2026-09-03T09:30:00"), COMERCIAL);
    expect(minutos(total!)).toBe(60);
  });

  it("pula o fim de semana inteiro", () => {
    // Sexta 17h até segunda 9h30. Sábado e domingo não contam.
    const total = segundosDeExpediente(em("2026-09-04T17:00:00"), em("2026-09-07T09:30:00"), COMERCIAL);
    expect(minutos(total!)).toBe(90);
  });

  it("devolve zero quando tudo aconteceu fora do expediente", () => {
    // Sábado inteiro: ninguém estava atendendo, e nenhum tempo de espera é
    // atribuível à equipe.
    const total = segundosDeExpediente(em("2026-09-05T10:00:00"), em("2026-09-05T18:00:00"), COMERCIAL);
    expect(total).toBe(0);
  });

  it("conta um dia inteiro de expediente como nove horas", () => {
    const total = segundosDeExpediente(em("2026-09-02T00:00:00"), em("2026-09-03T00:00:00"), COMERCIAL);
    expect(minutos(total!)).toBe(9 * 60);
  });

  it("atravessa vários dias sem perder nenhum", () => {
    // Segunda 9h até sexta 18h: cinco dias úteis completos.
    const total = segundosDeExpediente(em("2026-08-31T09:00:00"), em("2026-09-04T18:00:00"), COMERCIAL);
    expect(minutos(total!)).toBe(5 * 9 * 60);
  });

  it("recusa fim antes do começo em vez de devolver negativo", () => {
    expect(segundosDeExpediente(em("2026-09-02T12:00:00"), em("2026-09-02T11:00:00"), COMERCIAL)).toBeNull();
  });

  it("cai para o relógio corrido se a janela estiver invertida", () => {
    // Configuração impossível não pode zerar a métrica em silêncio.
    const total = segundosDeExpediente(em("2026-09-02T10:00:00"), em("2026-09-02T11:00:00"), {
      ...COMERCIAL,
      inicioMinutos: 18 * 60,
      fimMinutos: 9 * 60,
    });
    expect(minutos(total!)).toBe(60);
  });
});
