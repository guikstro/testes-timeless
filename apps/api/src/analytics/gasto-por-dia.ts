/**
 * O extrato diário: quanto saiu em cada dia do período.
 *
 * É o que falta a um total para ele virar uma área de cobrança. "Cinco mil
 * gastos no mês" não diz se foram duzentos por dia ou mil em três dias e nada
 * no resto, e essas duas situações pedem decisões opostas.
 *
 * A regra que organiza o arquivo: um dia que ainda não aconteceu não gastou
 * zero, ele não tem medida. Desenhar barra zerada no resto do mês diria que o
 * anúncio parou, quando o que houve é que o dia não chegou.
 */

export interface DiaDeGasto {
  /** Dia civil, AAAA-MM-DD. */
  dia: string;
  /** Null nos dias que ainda não aconteceram. */
  gastoCentavos: number | null;
  /** Soma do período até este dia, inclusive. Null pelo mesmo motivo. */
  acumuladoCentavos: number | null;
}

export interface LinhaDeGasto {
  date: Date;
  spendCents: number;
}

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Datas de gasto são dia civil gravado à meia-noite UTC, e é assim que elas
 * precisam ser lidas. Passá-las por uma conversão para Brasília as joga um dia
 * para trás, porque meia-noite em UTC é nove da noite do dia anterior aqui.
 */
function diaDeCalendario(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function gastoPorDia(
  linhas: LinhaDeGasto[],
  janela: { de: string; ate: string },
  hoje: string,
): DiaDeGasto[] {
  const totalDoDia = new Map<string, number>();
  for (const linha of linhas) {
    const dia = diaDeCalendario(linha.date);
    totalDoDia.set(dia, (totalDoDia.get(dia) ?? 0) + linha.spendCents);
  }

  const dias: DiaDeGasto[] = [];
  let acumulado = 0;

  for (
    let instante = Date.parse(`${janela.de}T00:00:00.000Z`);
    instante <= Date.parse(`${janela.ate}T00:00:00.000Z`);
    instante += DIA_EM_MS
  ) {
    const dia = new Date(instante).toISOString().slice(0, 10);

    /*
      Dia futuro entra na série, mas sem número.

      Tirá-lo encolheria o mês no gráfico e esconderia quanto tempo ainda
      falta, que é metade da pergunta de quem olha uma verba. Preenchê-lo com
      zero afirmaria um gasto que ninguém mediu.
    */
    if (dia > hoje) {
      dias.push({ dia, gastoCentavos: null, acumuladoCentavos: null });
      continue;
    }

    // Dia passado sem linha é zero de verdade: a sincronia cobriu o dia e não
    // achou gasto. Diferente do dia que ainda não chegou.
    const gastoCentavos = totalDoDia.get(dia) ?? 0;
    acumulado += gastoCentavos;
    dias.push({ dia, gastoCentavos, acumuladoCentavos: acumulado });
  }

  return dias;
}

/** O maior gasto de um único dia, para a escala do gráfico. Zero quando não houve nenhum. */
export function picoDiario(dias: DiaDeGasto[]): number {
  return dias.reduce((maior, dia) => Math.max(maior, dia.gastoCentavos ?? 0), 0);
}
