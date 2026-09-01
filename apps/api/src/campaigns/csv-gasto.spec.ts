import { extraiGastos, leCsv, paraCentavos, paraDataIso } from "./csv-gasto";

describe("leitura de CSV de gasto", () => {
  describe("paraCentavos", () => {
    it("lê o formato brasileiro", () => {
      expect(paraCentavos("1.234,56")).toBe(123456);
      expect(paraCentavos("250,00")).toBe(25000);
    });

    /** O mesmo relatório muda de formato conforme o idioma da conta. */
    it("lê o formato em inglês", () => {
      expect(paraCentavos("1,234.56")).toBe(123456);
      expect(paraCentavos("250.00")).toBe(25000);
    });

    it("ignora símbolo de moeda e espaços", () => {
      expect(paraCentavos("R$ 1.500,00")).toBe(150000);
      expect(paraCentavos("$99.90")).toBe(9990);
    });

    it("lê número inteiro sem separador", () => {
      expect(paraCentavos("300")).toBe(30000);
    });

    it("recusa texto que não é valor", () => {
      expect(paraCentavos("")).toBeNull();
      expect(paraCentavos("--")).toBeNull();
      expect(paraCentavos("indisponível")).toBeNull();
    });
  });

  describe("paraDataIso", () => {
    it("aceita ISO", () => {
      expect(paraDataIso("2026-08-31")).toBe("2026-08-31");
      expect(paraDataIso("2026-08-31 00:00")).toBe("2026-08-31");
    });

    it("aceita o formato brasileiro com barra, traço ou ponto", () => {
      expect(paraDataIso("31/08/2026")).toBe("2026-08-31");
      expect(paraDataIso("5-9-2026")).toBe("2026-09-05");
      expect(paraDataIso("05.09.2026")).toBe("2026-09-05");
    });

    it("recusa data impossível", () => {
      expect(paraDataIso("31/13/2026")).toBeNull();
      expect(paraDataIso("ontem")).toBeNull();
    });
  });

  describe("leCsv", () => {
    it("detecta o delimitador e o cabeçalho", () => {
      const csv = leCsv("Dia;Custo\n31/08/2026;250,00");
      expect(csv.cabecalho).toEqual(["Dia", "Custo"]);
      expect(csv.linhas).toEqual([["31/08/2026", "250,00"]]);
    });

    /** Um split simples desalinharia a linha inteira e jogaria o gasto para a coluna errada. */
    it("respeita vírgula dentro de aspas", () => {
      const csv = leCsv('Campanha,Dia,Custo\n"Busca, Institucional",31/08/2026,"1.200,00"');
      expect(csv.linhas[0]).toEqual(["Busca, Institucional", "31/08/2026", "1.200,00"]);
    });

    /** O Google Ads põe títulos antes do cabeçalho de verdade. */
    it("pula o preâmbulo do relatório", () => {
      const csv = leCsv("Relatório de campanha\nDia,Custo\n31/08/2026,250,00".replace("250,00", '"250,00"'));
      expect(csv.cabecalho).toEqual(["Dia", "Custo"]);
    });

    it("descarta o rodapé de totais, que tem menos colunas", () => {
      const csv = leCsv("Dia,Custo\n31/08/2026,250\nTotal");
      expect(csv.linhas).toHaveLength(1);
    });

    it("sugere as colunas de data e valor pelo nome", () => {
      const csv = leCsv("Campanha,Data,Cliques,Custo\nA,31/08/2026,10,250");
      expect(csv.sugestaoData).toBe(1);
      expect(csv.sugestaoValor).toBe(3);
    });

    it("não quebra com arquivo vazio", () => {
      expect(leCsv("").linhas).toEqual([]);
      expect(leCsv("   \n  ").cabecalho).toEqual([]);
    });
  });

  describe("extraiGastos", () => {
    /**
     * Relatório detalhado traz várias linhas do mesmo dia, uma por anúncio.
     * Somar é o certo aqui, ao contrário do lançamento manual.
     */
    it("soma as linhas do mesmo dia", () => {
      const csv = leCsv("Dia,Custo\n31/08/2026,100\n31/08/2026,150\n01/09/2026,200");
      const { linhas } = extraiGastos(csv, 0, 1);

      expect(linhas).toEqual([
        { date: "2026-08-31", spendCents: 25000 },
        { date: "2026-09-01", spendCents: 20000 },
      ]);
    });

    it("devolve em ordem de data", () => {
      const csv = leCsv("Dia,Custo\n03/09/2026,10\n01/09/2026,20");
      expect(extraiGastos(csv, 0, 1).linhas.map((l) => l.date)).toEqual(["2026-09-01", "2026-09-03"]);
    });

    /** Descartar em silêncio esconderia gasto que não entrou na conta. */
    it("relata as linhas que não deu para ler, em vez de sumir com elas", () => {
      const csv = leCsv("Dia,Custo\n31/08/2026,100\nsem data,50\n01/09/2026,xis");
      const { linhas, ignoradas } = extraiGastos(csv, 0, 1);

      expect(linhas).toHaveLength(1);
      expect(ignoradas).toHaveLength(2);
      expect(ignoradas[0].motivo).toContain("data não reconhecida");
      expect(ignoradas[1].motivo).toContain("valor não reconhecido");
    });

    it("aceita gasto zero como dia válido", () => {
      const csv = leCsv("Dia,Custo\n31/08/2026,0");
      expect(extraiGastos(csv, 0, 1).linhas).toEqual([{ date: "2026-08-31", spendCents: 0 }]);
    });
  });
});
