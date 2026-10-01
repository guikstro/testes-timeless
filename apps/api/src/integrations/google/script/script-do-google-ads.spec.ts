import { runInNewContext } from "node:vm";
import { scriptDoGoogleAds, VERSAO_DO_SCRIPT } from "./script-do-google-ads";

interface Envio {
  versao: number;
  periodo: { de: string; ate: string };
  historico?: boolean;
  historicoFim?: boolean;
  campanhas: { id: string; dias: { data: string }[] }[];
}

/**
 * Roda o script gerado como o Google Ads roda: num contexto só com AdsApp,
 * Utilities, UrlFetchApp e Logger, de mentira. As consultas devolvem uma
 * campanha com um dia de gasto no começo de cada período pedido, e a
 * Timeless de mentira responde o que o teste mandar.
 */
function roda(agora: string, respostaDaTimeless: (envio: Envio) => object | string, fuso = "America/Sao_Paulo") {
  const envios: Envio[] = [];
  const consultas: string[] = [];

  const formatDate = (data: Date, zona: string, formato: string) => {
    expect(formato).toBe("yyyy-MM-dd");
    return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(data);
  };

  const contexto = {
    Date: class extends Date {
      constructor(...args: unknown[]) {
        // O "agora" da rodada; com argumento, a data pedida.
        super(...((args.length ? args : [agora]) as []));
      }
    },
    Math,
    JSON,
    String,
    Number,
    Object,
    Error,
    AdsApp: {
      currentAccount: () => ({
        getTimeZone: () => fuso,
        getCustomerId: () => "123-456-7890",
        getName: () => "Clínica Sorriso",
        getCurrencyCode: () => "BRL",
      }),
      search: (consulta: string) => {
        consultas.push(consulta);
        const de = /BETWEEN '(\d{4}-\d{2}-\d{2})'/.exec(consulta)![1];
        const linhas = consulta.includes("metrics.cost_micros")
          ? [
              {
                campaign: { id: 20001, name: "Busca", status: "ENABLED" },
                campaignBudget: { amountMicros: "50000000" },
                segments: { date: de },
                metrics: { costMicros: "1000000", impressions: "10", clicks: "1", conversions: 0, conversionsValue: 0 },
              },
            ]
          : [];
        let i = 0;
        return { hasNext: () => i < linhas.length, next: () => linhas[i++] };
      },
    },
    Utilities: { formatDate },
    UrlFetchApp: {
      fetch: (_endereco: string, opcoes: { payload: string }) => {
        const envio = JSON.parse(opcoes.payload) as Envio;
        envios.push(envio);
        const resposta = respostaDaTimeless(envio);
        const corpo = typeof resposta === "string" ? resposta : JSON.stringify(resposta);
        return { getResponseCode: () => 200, getContentText: () => corpo };
      },
    },
    Logger: { log: () => undefined },
  };

  runInNewContext(`${scriptDoGoogleAds("https://exemplo.test/api/publico/google-ads/envio", "tml_gads_teste")}\nmain();`, contexto);
  return { envios, consultas };
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000) + 1;
const diaAntes = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

describe("o script do Google Ads", () => {
  it("de hora em hora manda os últimos 35 dias, e só, quando o histórico já chegou", () => {
    const { envios } = roda("2026-10-01T15:00:00.000Z", () => ({ recebido: true, historicoPendente: false }));

    expect(envios).toHaveLength(1);
    expect(envios[0].versao).toBe(VERSAO_DO_SCRIPT);
    expect(envios[0].periodo).toEqual({ de: "2026-08-28", ate: "2026-10-01" });
    expect(envios[0].historico).toBeUndefined();
  });

  it("com o histórico pendente, manda os 13 meses anteriores em blocos de até 60 dias, sem buraco e sem sobra", () => {
    const { envios } = roda("2026-10-01T15:00:00.000Z", () => ({ recebido: true, historicoPendente: true }));

    const [rodada, ...blocos] = envios;
    expect(rodada.historico).toBeUndefined();
    expect(blocos.length).toBeGreaterThan(1);

    // Cada bloco termina no dia antes do começo do anterior.
    let fim = diaAntes(rodada.periodo.de);
    for (const bloco of blocos) {
      expect(bloco.historico).toBe(true);
      expect(bloco.periodo.ate).toBe(fim);
      expect(diasEntre(bloco.periodo.de, bloco.periodo.ate)).toBeLessThanOrEqual(60);
      fim = diaAntes(bloco.periodo.de);
    }

    // Desde o dia 1º do mês de 13 meses atrás.
    expect(blocos.at(-1)!.periodo.de).toBe("2025-09-01");
    expect(blocos.map((b) => b.historicoFim)).toEqual([...blocos.slice(1).map(() => false), true]);

    // O dia lido em cada bloco é o do próprio bloco, e cabe no teto de 62 por campanha.
    for (const bloco of blocos) {
      expect(bloco.campanhas[0].dias).toEqual([expect.objectContaining({ data: bloco.periodo.de })]);
    }
  });

  it("o histórico começa no dia 1º: colado no dia 20, setembro do ano passado vem inteiro", () => {
    const { envios } = roda("2026-10-20T15:00:00.000Z", () => ({ historicoPendente: true }));
    const blocos = envios.slice(1);
    expect(blocos.at(-1)!.periodo.de).toBe("2025-09-01");
    expect(blocos.at(-1)!.historicoFim).toBe(true);
    expect(blocos.every((b) => diasEntre(b.periodo.de, b.periodo.ate) <= 60)).toBe(true);
  });

  it("conta o dia de hoje no fuso da conta: às 23h de Brasília ainda é o mesmo dia", () => {
    const { envios } = roda("2026-10-02T02:30:00.000Z", () => ({ historicoPendente: false }));
    expect(envios[0].periodo.ate).toBe("2026-10-01");
  });

  it("não se perde na troca do horário de verão de uma conta de fora", () => {
    // Nova York adianta o relógio em 08/03/2026: perto da meia-noite, somar
    // 24 horas pularia um dia. O histórico inteiro tem de continuar contínuo.
    const { envios } = roda("2026-03-09T04:30:00.000Z", () => ({ historicoPendente: true }), "America/New_York");

    const [rodada, ...blocos] = envios;
    expect(rodada.periodo.ate).toBe("2026-03-09");
    expect(diasEntre(rodada.periodo.de, rodada.periodo.ate)).toBe(35);
    let fim = diaAntes(rodada.periodo.de);
    for (const bloco of blocos) {
      expect(bloco.periodo.ate).toBe(fim);
      fim = diaAntes(bloco.periodo.de);
    }
  });

  it("uma resposta que não é JSON não derruba a rodada: só não manda o histórico", () => {
    const { envios } = roda("2026-10-01T15:00:00.000Z", () => "<html>ok</html>");
    expect(envios).toHaveLength(1);
  });
});
