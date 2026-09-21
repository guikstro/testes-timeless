import { diaCivilLocal, FUSO } from "../common/tempo";

/**
 * A conta da verba: quanto entrou, quanto saiu, quanto sobra e até quando dá.
 *
 * Função pura, fora do serviço, porque é aqui que mora o número que o cliente
 * olha para decidir se coloca mais dinheiro. Erra aqui e a tela mente com
 * aparência de precisão.
 *
 * A regra que organiza tudo: zero é uma medida, ausência de medida é `null`.
 * Sem gasto nenhum ainda, o ritmo diário não é zero, é desconhecido — e uma
 * projeção feita em cima de zero diria "a verba dura para sempre".
 */

export interface Verba {
  amountCents: number;
  startsOn: Date;
  endsOn: Date | null;
}

export interface SituacaoDaVerba {
  amountCents: number;
  /** Dia civil de início e fim, no formato AAAA-MM-DD. `ate` é null quando vale até acabar. */
  de: string;
  ate: string | null;
  gastoCentavos: number;
  /** Pode ser negativo: estourar a verba é um fato, e esconder isso seria mentir. */
  saldoCentavos: number;
  /** De 0 a 100, podendo passar de 100 quando estourou. Null quando a verba é zero. */
  consumidoPorCento: number | null;
  /** Dias já corridos da verba, contando o de hoje. */
  diasCorridos: number;
  /** Dias até o fim declarado. Null quando a verba vale até acabar. */
  diasRestantes: number | null;
  /** Média por dia até aqui. Null enquanto nada foi gasto: ritmo zero não é ritmo. */
  ritmoDiarioCentavos: number | null;
  /** Em que dia o saldo acaba no ritmo atual. Null quando não dá para saber. */
  acabaEm: string | null;
  /**
   * O ritmo que faria a verba durar exatamente até o fim declarado.
   *
   * Existe para a comparação com o ritmo real dizer alguma coisa: gastar
   * duzentos por dia é rápido ou devagar dependendo de quanto tempo falta.
   * Null quando não há fim declarado ou quando não sobra dia nenhum.
   */
  ritmoIdealCentavos: number | null;
}

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * O dia de calendário de uma data, lido em UTC.
 *
 * `diaCivilLocal` não serve aqui, e a diferença não é detalhe: as datas de
 * verba são dia civil sem hora, que o Prisma devolve à meia-noite UTC. Passar
 * isso por uma conversão de fuso brasileiro joga a data um dia para trás,
 * porque meia-noite em UTC é nove da noite do dia anterior em São Paulo. É a
 * mesma distinção que `tempo.ts` documenta entre instante e dia civil.
 */
function diaDeCalendario(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Quantos dias civis separam duas datas, contando as duas pontas. */
function diasEntre(de: Date, ate: Date): number {
  const inicio = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const fim = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate());
  return Math.floor((fim - inicio) / DIA_EM_MS) + 1;
}

export function situacaoDaVerba(verba: Verba, gastoCentavos: number, agora = new Date()): SituacaoDaVerba {
  /*
    O "hoje" é o dia de Brasília, ancorado na meia-noite UTC para a aritmética
    de calendário abaixo. `agora` é um instante e precisa da conversão de
    fuso; o resultado dela vira dia de calendário e daí em diante só se soma
    dia, nunca hora.
  */
  const hoje = new Date(`${diaCivilLocal(agora, FUSO)}T00:00:00.000Z`);
  const saldoCentavos = verba.amountCents - gastoCentavos;

  // Contando o dia de hoje: no primeiro dia já se gastou um dia de verba.
  // Nunca menos que um, porque uma verba que começa amanhã não corre para
  // trás, e dividir por zero ou por negativo produziria ritmo sem sentido.
  const diasCorridos = Math.max(1, diasEntre(verba.startsOn, hoje));

  const diasRestantes = verba.endsOn ? Math.max(0, diasEntre(hoje, verba.endsOn) - 1) : null;

  // Enquanto nada foi gasto o ritmo é desconhecido, não zero. Com zero, a
  // projeção abaixo diria que a verba dura para sempre.
  const ritmoDiarioCentavos = gastoCentavos > 0 ? Math.round(gastoCentavos / diasCorridos) : null;

  const acabaEm =
    ritmoDiarioCentavos && ritmoDiarioCentavos > 0 && saldoCentavos > 0
      ? diaDeCalendario(new Date(hoje.getTime() + Math.ceil(saldoCentavos / ritmoDiarioCentavos) * DIA_EM_MS))
      : null;

  const ritmoIdealCentavos =
    diasRestantes !== null && diasRestantes > 0 && saldoCentavos > 0
      ? Math.round(saldoCentavos / diasRestantes)
      : null;

  return {
    amountCents: verba.amountCents,
    de: diaDeCalendario(verba.startsOn),
    ate: verba.endsOn ? diaDeCalendario(verba.endsOn) : null,
    gastoCentavos,
    saldoCentavos,
    consumidoPorCento:
      verba.amountCents > 0 ? Math.round((gastoCentavos / verba.amountCents) * 1000) / 10 : null,
    diasCorridos,
    diasRestantes,
    ritmoDiarioCentavos,
    acabaEm,
    ritmoIdealCentavos,
  };
}
