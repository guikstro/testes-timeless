import { diaCivilLocal, diaDaSemanaLocal, instanteEm } from "./tempo";

/**
 * O horário em que a equipe atende.
 *
 * Existe para uma métrica parar de mentir. O tempo até a primeira resposta é
 * medido em relógio corrido: um lead que chega às 23h e é respondido às 9h da
 * manhã seguinte aparece como dez horas de espera. Para quem não atende de
 * madrugada, isso não descreve descaso nenhum, e é o número que o produto
 * mais destaca.
 *
 * Descontando o que está fora do expediente, aquele mesmo caso vira alguns
 * minutos, que é o que de fato aconteceu do ponto de vista de quem atende.
 */
export interface Expediente {
  /** Desligado devolve o relógio corrido, que é o comportamento de sempre. */
  ativo: boolean;
  /** Dias em que se atende. 0 é domingo, como no Date do JavaScript. */
  dias: number[];
  /** Minutos desde a meia-noite, no fuso da organização. */
  inicioMinutos: number;
  fimMinutos: number;
  fuso: string;
}

const DIA_EM_MS = 86_400_000;
/**
 * Teto de dias percorridos numa conta só.
 *
 * Uma espera de mais de um ano quase sempre é dado sujo, e sem teto uma data
 * absurda faria o laço rodar por milhares de iterações a cada lead.
 */
const MAXIMO_DE_DIAS = 400;

/**
 * Segundos de expediente entre dois instantes.
 *
 * Devolve null quando o fim vem antes do começo, pelo mesmo motivo do resto
 * das métricas: um número negativo aqui seria interpretado como espera, e é
 * na verdade um dado impossível.
 */
export function segundosDeExpediente(de: Date, ate: Date, expediente: Expediente): number | null {
  const corridos = Math.round((ate.getTime() - de.getTime()) / 1000);
  if (corridos < 0) return null;
  if (!expediente.ativo || expediente.dias.length === 0) return corridos;
  if (expediente.fimMinutos <= expediente.inicioMinutos) return corridos;

  let total = 0;
  let cursor = de;

  for (let i = 0; i < MAXIMO_DE_DIAS; i += 1) {
    const dia = diaCivilLocal(cursor, expediente.fuso);
    if (cursor > ate) break;

    if (expediente.dias.includes(diaDaSemanaLocal(cursor, expediente.fuso))) {
      const abertura = instanteEm(dia, expediente.inicioMinutos, expediente.fuso);
      const fechamento = instanteEm(dia, expediente.fimMinutos, expediente.fuso);

      // Interseção entre a espera e a janela de atendimento daquele dia.
      const comeco = Math.max(cursor.getTime(), abertura.getTime());
      const fim = Math.min(ate.getTime(), fechamento.getTime());
      if (fim > comeco) total += (fim - comeco) / 1000;
    }

    // Avança para a meia-noite do dia seguinte, no fuso da organização.
    const proximoDia = new Date(instanteEm(dia, 0, expediente.fuso).getTime() + DIA_EM_MS * 1.5);
    cursor = instanteEm(diaCivilLocal(proximoDia, expediente.fuso), 0, expediente.fuso);
    if (cursor.getTime() <= de.getTime()) break;
  }

  return Math.round(total);
}
