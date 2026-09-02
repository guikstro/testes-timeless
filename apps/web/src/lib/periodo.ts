/**
 * Meses como unidade de período.
 *
 * Uma janela de "últimos N dias" nunca isola a campanha que rodou em março, e
 * é exatamente isso que se quer olhar quando a mesma organização roda
 * campanhas diferentes ao longo do ano. Mês é a unidade em que se decide
 * orçamento, então é a unidade em que se compara resultado.
 *
 * Tudo aqui trabalha em UTC de propósito: é o eixo em que a API guarda os dias
 * de gasto, e converter para o fuso do navegador faria o primeiro dia do mês
 * escolhido cair no mês anterior.
 */

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface Intervalo {
  /** Dia civil AAAA-MM-DD, inclusive nas duas pontas. */
  de: string;
  ate: string;
}

/** `mes` de 1 a 12, como se lê num calendário e não como no Date do JavaScript. */
export function intervaloDoMes(ano: number, mes: number): Intervalo {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  // Dia zero do mês seguinte é o último dia deste, o que resolve fevereiro e
  // ano bissexto sem tabela de tamanhos.
  const ultimo = new Date(Date.UTC(ano, mes, 0));
  return { de: diaCivil(primeiro), ate: diaCivil(ultimo) };
}

export function diaCivil(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** O mês que um intervalo representa, ou null quando ele não cobre um mês inteiro. */
export function mesDoIntervalo(intervalo: Intervalo): { ano: number; mes: number } | null {
  const [ano, mes] = intervalo.de.split("-").map(Number);
  if (!ano || !mes) return null;
  const doMes = intervaloDoMes(ano, mes);
  return doMes.de === intervalo.de && doMes.ate === intervalo.ate ? { ano, mes } : null;
}

export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/**
 * O mês corrente no fuso de quem usa, e não em UTC.
 *
 * Os contêineres declaram `TZ=America/Sao_Paulo`, então o relógio local aqui é
 * o de Brasília. Em UTC, entre as 21h e a meia-noite do último dia do mês a
 * tela abriria já no mês seguinte.
 */
export function mesAtual(agora = new Date()): { ano: number; mes: number } {
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

/**
 * Como o período aparece escrito na tela. Mês inteiro vira "Março de 2026";
 * qualquer outro recorte mostra as duas datas, porque chamá-lo de "março"
 * quando ele cobre metade do mês seria uma legenda falsa.
 */
export function rotuloDoIntervalo(intervalo: Intervalo): string {
  const mes = mesDoIntervalo(intervalo);
  if (mes) return `${MESES[mes.mes - 1]} de ${mes.ano}`;
  return `${formataDia(intervalo.de)} a ${formataDia(intervalo.ate)}`;
}

export function formataDia(dia: string): string {
  const [ano, mes, data] = dia.split("-");
  return `${data}/${mes}/${ano}`;
}

/** Valida o que veio pela URL, que é texto de fora e não merece confiança. */
export function leIntervalo(de: unknown, ate: unknown): Intervalo | null {
  if (typeof de !== "string" || typeof ate !== "string") return null;
  if (!ehDiaCivil(de) || !ehDiaCivil(ate)) return null;
  if (de > ate) return null;
  return { de, ate };
}

function ehDiaCivil(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  // Round-trip contra o Date: 2026-02-31 passa no regex e viraria 3 de março
  // silenciosamente, então a única prova de que a data existe é ela voltar igual.
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && diaCivil(data) === valor;
}
