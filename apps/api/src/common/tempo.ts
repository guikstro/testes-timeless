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

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  const existente = formatadores.get(fuso);
  if (existente) return existente;
  // Criar um Intl.DateTimeFormat não é barato, e isto roda por lead.
  const novo = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatadores.set(fuso, novo);
  return novo;
}

function partes(instante: Date, fuso: string = FUSO): Record<string, number> {
  const lidas: Record<string, number> = {};
  for (const parte of formatador(fuso).formatToParts(instante)) {
    if (parte.type !== "literal") lidas[parte.type] = Number(parte.value);
  }
  // Meia-noite sai como "24" em alguns ambientes com hour12 desligado.
  if (lidas.hour === 24) lidas.hour = 0;
  return lidas;
}

/** Quantos minutos o fuso está à frente do UTC naquele instante (negativo no Brasil). */
function deslocamentoMinutos(instante: Date, fuso: string): number {
  const p = partes(instante, fuso);
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
export function instanteLocal(dia: string, hora: string, fuso: string = FUSO): Date {
  const palpite = new Date(`${dia}T${hora}Z`);
  const primeiraEstimativa = new Date(palpite.getTime() - deslocamentoMinutos(palpite, fuso) * 60_000);
  return new Date(palpite.getTime() - deslocamentoMinutos(primeiraEstimativa, fuso) * 60_000);
}

/** O instante de um horário de parede dado em minutos desde a meia-noite. */
export function instanteEm(dia: string, minutosDoDia: number, fuso: string = FUSO): Date {
  const horas = String(Math.floor(minutosDoDia / 60)).padStart(2, "0");
  const minutos = String(minutosDoDia % 60).padStart(2, "0");
  return instanteLocal(dia, `${horas}:${minutos}:00.000`, fuso);
}

/** Instante em que começa o dia civil brasileiro `AAAA-MM-DD`. */
export function inicioDoDia(dia: string, fuso: string = FUSO): Date {
  return instanteLocal(dia, "00:00:00.000", fuso);
}

/** Último instante do dia civil brasileiro, para fechar uma janela inclusiva. */
export function fimDoDia(dia: string, fuso: string = FUSO): Date {
  return instanteLocal(dia, "23:59:59.999", fuso);
}

/** Em que dia civil brasileiro um instante caiu. */
export function diaCivilLocal(instante: Date, fuso: string = FUSO): string {
  const p = partes(instante, fuso);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** O dia civil brasileiro de hoje. */
export function hojeLocal(agora = new Date()): string {
  return diaCivilLocal(agora);
}

/** Dia da semana no fuso pedido: 0 é domingo, como no Date do JavaScript. */
export function diaDaSemanaLocal(instante: Date, fuso: string = FUSO): number {
  const dia = diaCivilLocal(instante, fuso);
  // Meio-dia UTC do dia civil nunca muda de data por causa de fuso, o que
  // torna a leitura do dia da semana segura em qualquer deslocamento.
  return new Date(`${dia}T12:00:00.000Z`).getUTCDay();
}
