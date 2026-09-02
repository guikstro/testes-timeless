import { formataHorario, LeadParaExportar, montaLinhas } from "./google-conversion-rows";

const FUSO = "America/Sao_Paulo";
const em = (iso: string) => new Date(iso);

function lead(over: Partial<LeadParaExportar> = {}): LeadParaExportar {
  return {
    id: "lead-1",
    name: "Ana",
    qualifiedAt: null,
    wonAt: null,
    sale: null,
    gclid: "Cj0KCQ",
    clickedAt: em("2026-08-01T12:00:00.000Z"),
    ...over,
  };
}

const DE = em("2026-08-01T03:00:00.000Z");
const ATE = em("2026-09-01T02:59:59.999Z");

describe("formataHorario", () => {
  it("escreve o horário local com o deslocamento explícito", () => {
    // 17:32 UTC são 14:32 em Brasília.
    expect(formataHorario(em("2026-09-01T17:32:10.000Z"), FUSO)).toBe("2026-09-01 14:32:10-03:00");
  });

  it("acerta a virada da meia-noite local", () => {
    // 02:30 UTC do dia 2 ainda são 23:30 do dia 1 em Brasília.
    expect(formataHorario(em("2026-09-02T02:30:00.000Z"), FUSO)).toBe("2026-09-01 23:30:00-03:00");
  });

  it("respeita outro fuso quando a organização usa outro", () => {
    expect(formataHorario(em("2026-09-01T17:32:10.000Z"), "UTC")).toBe("2026-09-01 17:32:10+00:00");
  });
});

describe("montaLinhas", () => {
  it("gera uma linha por conversão que caiu na janela", () => {
    const linhas = montaLinhas(
      [
        lead({
          qualifiedAt: em("2026-08-10T14:00:00.000Z"),
          wonAt: em("2026-08-20T14:00:00.000Z"),
          sale: { amountCents: 470000, detectedAt: em("2026-08-20T14:00:00.000Z") },
        }),
      ],
      DE,
      ATE,
      FUSO,
    );

    expect(linhas.map((l) => l.tipo)).toEqual(["WON", "QUALIFIED"]);
    expect(linhas[0].valorCentavos).toBe(470000);
    // Qualificar não é receita: mandar um número aqui ensinaria o Google a
    // otimizar por uma receita que não existe.
    expect(linhas[1].valorCentavos).toBeNull();
  });

  it("deixa de fora o que aconteceu antes ou depois da janela", () => {
    const linhas = montaLinhas(
      [lead({ qualifiedAt: em("2026-07-15T14:00:00.000Z") })],
      DE,
      ATE,
      FUSO,
    );

    expect(linhas).toHaveLength(0);
  });

  it("marca, sem esconder, a conversão cujo clique passou de noventa dias", () => {
    const linhas = montaLinhas(
      [
        lead({
          clickedAt: em("2026-04-01T12:00:00.000Z"),
          qualifiedAt: em("2026-08-10T14:00:00.000Z"),
        }),
      ],
      DE,
      ATE,
      FUSO,
    );

    // O Google recusa esta linha. Some-la esconderia por que o número
    // exportado é menor que o número de qualificados do período.
    expect(linhas[0].foraDaJanela).toBe(true);
  });

  it("usa o instante em que a venda foi detectada", () => {
    const linhas = montaLinhas(
      [
        lead({
          wonAt: em("2026-08-20T10:00:00.000Z"),
          sale: { amountCents: 100, detectedAt: em("2026-08-21T18:00:00.000Z") },
        }),
      ],
      DE,
      ATE,
      FUSO,
    );

    expect(linhas[0].conversionTime).toBe("2026-08-21 15:00:00-03:00");
  });

  it("aceita venda sem valor sem inventar um", () => {
    const linhas = montaLinhas(
      [lead({ wonAt: em("2026-08-20T14:00:00.000Z"), sale: { amountCents: null, detectedAt: em("2026-08-20T14:00:00.000Z") } })],
      DE,
      ATE,
      FUSO,
    );

    expect(linhas[0].valorCentavos).toBeNull();
  });
});
