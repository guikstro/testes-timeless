import { contaExportaveis, LinhaDeConversao, montaCsv } from "./conversoes-csv";

function linha(over: Partial<LinhaDeConversao> = {}): LinhaDeConversao {
  return {
    leadId: "lead-1",
    leadNome: "Ana",
    gclid: "Cj0KCQ",
    tipo: "QUALIFIED",
    conversionTime: "2026-09-01 14:32:10-03:00",
    ocorridoEm: "2026-09-01T17:32:10.000Z",
    valorCentavos: null,
    foraDaJanela: false,
    ...over,
  };
}

const ACOES = { qualificado: "Lead qualificado", venda: "Venda" };

describe("montaCsv", () => {
  it("escreve o cabeçalho do modelo do Google e uma linha por conversão", () => {
    const csv = montaCsv([linha(), linha({ tipo: "WON", valorCentavos: 470000 })], ACOES, "BRL");
    const linhas = csv.trimEnd().split("\r\n");

    expect(linhas[0]).toBe("Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency");
    expect(linhas[1]).toBe("Cj0KCQ,Lead qualificado,2026-09-01 14:32:10-03:00,,BRL");
    expect(linhas[2]).toBe("Cj0KCQ,Venda,2026-09-01 14:32:10-03:00,4700.00,BRL");
  });

  it("protege o nome da ação que tem vírgula", () => {
    // Sem aspas, a vírgula empurraria as colunas seguintes uma casa, e o
    // Google leria o horário no lugar do valor.
    const csv = montaCsv([linha()], { qualificado: "Lead, qualificado", venda: null }, "BRL");
    expect(csv).toContain('"Lead, qualificado"');
  });

  it("dobra a aspa que estiver dentro do nome", () => {
    const csv = montaCsv([linha()], { qualificado: 'Lead "bom"', venda: null }, "BRL");
    expect(csv).toContain('"Lead ""bom"""');
  });

  it("deixa de fora o que o Google recusaria por causa dos noventa dias", () => {
    const csv = montaCsv([linha({ foraDaJanela: true }), linha()], ACOES, "BRL");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("deixa de fora o tipo cuja ação ainda não foi nomeada", () => {
    // Sem o nome, a linha não teria como casar com nada no Google.
    const csv = montaCsv([linha({ tipo: "WON" })], { qualificado: "Lead qualificado", venda: null }, "BRL");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("gera só o cabeçalho quando não há nada a exportar", () => {
    expect(montaCsv([], ACOES, "BRL")).toBe(
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n",
    );
  });
});

describe("contaExportaveis", () => {
  it("conta só o que entra no arquivo", () => {
    const linhas = [linha(), linha({ foraDaJanela: true }), linha({ tipo: "WON" })];
    expect(contaExportaveis(linhas, { qualificado: "Lead qualificado", venda: null })).toBe(1);
    expect(contaExportaveis(linhas, ACOES)).toBe(2);
  });
});
