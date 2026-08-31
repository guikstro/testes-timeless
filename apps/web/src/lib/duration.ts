/**
 * Segundos em texto curto. A API devolve `null` para "não dá para saber" e
 * `0` para "instantâneo" — são coisas diferentes, e o traço só vale para o
 * primeiro.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "Sem dado";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes ? `${hours}h ${restMinutes}min` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export type SpeedTone = "good" | "warn" | "bad" | "neutral";

/**
 * Faixas para o tempo até a primeira resposta.
 *
 * Os cortes (5 e 30 minutos) são um ponto de partida, não uma verdade do
 * negócio: a literatura de vendas é consistente em que responder nos
 * primeiros minutos muda a taxa de conversão, mas o número exato varia por
 * setor. Ficam aqui, num lugar só, justamente para serem ajustados quando o
 * cliente tiver dados próprios.
 */
export function responseSpeedTone(seconds: number | null | undefined): SpeedTone {
  if (seconds === null || seconds === undefined) return "neutral";
  if (seconds <= 300) return "good";
  if (seconds <= 1800) return "warn";
  return "bad";
}

export const SPEED_TONE_CLASSES: Record<SpeedTone, string> = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
  neutral: "text-slate-700",
};
