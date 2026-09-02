/**
 * Dias civis no fuso do cliente.
 *
 * Os contêineres rodavam em UTC, então um lead que chegava às 22h no horário
 * de Brasília era contado no dia seguinte: no gráfico diário, no mapa de
 * horários e, no fim do mês, no mês errado. Nada disso aparece como erro, só
 * como número um pouco deslocado, que é o pior tipo de defeito num relatório
 * que o cliente lê.
 *
 * O fuso fica aqui, num lugar só, e não espalhado em cada consulta.
 *
 * Uma distinção que precisa ficar clara para quem mexer nisto depois:
 *
 * - `Lead.firstContactAt` é um instante. Para saber em que dia ele caiu, é
 *   preciso perguntar em que fuso, e a resposta é este módulo.
 * - `AdSpend.date` é um dia civil sem hora, gravado na meia-noite UTC por
 *   convenção. Ele não é um instante e não deve passar por aqui: a janela de
 *   gasto continua sendo montada em UTC.
 */

export const FUSO = "America/Sao_Paulo";

const FORMATADOR = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partes(instante: Date): Record<string, number> {
  const lidas: Record<string, number> = {};
  for (const parte of FORMATADOR.formatToParts(instante)) {
    if (parte.type !== "literal") lidas[parte.type] = Number(parte.value);
  }
  // Meia-noite sai como "24" em alguns ambientes com hour12 desligado.
  if (lidas.hour === 24) lidas.hour = 0;
  return lidas;
}

/** Quantos minutos o fuso está à frente do UTC naquele instante (negativo no Brasil). */
function deslocamentoMinutos(instante: Date): number {
  const p = partes(instante);
  const relogioLocalComoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (relogioLocalComoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000;
}

/**
 * O instante em que um horário de parede brasileiro acontece.
 *
 * Duas passagens: a primeira estima o deslocamento tratando o palpite como
 * UTC, a segunda confirma já com o instante corrigido. O Brasil não tem
 * horário de verão desde 2019, então hoje as duas dão o mesmo resultado; se
 * voltar a ter, a conta continua certa sem ninguém precisar lembrar disto.
 */
function instanteLocal(dia: string, hora: string): Date {
  const palpite = new Date(`${dia}T${hora}Z`);
  const primeiraEstimativa = new Date(palpite.getTime() - deslocamentoMinutos(palpite) * 60_000);
  return new Date(palpite.getTime() - deslocamentoMinutos(primeiraEstimativa) * 60_000);
}

/** Instante em que começa o dia civil brasileiro `AAAA-MM-DD`. */
export function inicioDoDia(dia: string): Date {
  return instanteLocal(dia, "00:00:00.000");
}

/** Último instante do dia civil brasileiro, para fechar uma janela inclusiva. */
export function fimDoDia(dia: string): Date {
  return instanteLocal(dia, "23:59:59.999");
}

/** Em que dia civil brasileiro um instante caiu. */
export function diaCivilLocal(instante: Date): string {
  const p = partes(instante);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** O dia civil brasileiro de hoje. */
export function hojeLocal(agora = new Date()): string {
  return diaCivilLocal(agora);
}
