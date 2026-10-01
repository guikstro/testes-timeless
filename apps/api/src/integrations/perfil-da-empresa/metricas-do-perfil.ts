/**
 * As métricas diárias do Perfil da Empresa que este produto guarda, com o
 * nome que elas ganham em `metricas_locais` (fonte PERFIL_DA_EMPRESA).
 *
 * As visualizações vêm em quatro (Busca e Maps, celular e computador) e são
 * guardadas assim; a tela soma. Pedido de comida fica de fora: o Google
 * aposentou, e nenhum cliente daqui vende por ali.
 */
export const METRICAS_DO_PERFIL = {
  CALL_CLICKS: "LIGACOES",
  BUSINESS_DIRECTION_REQUESTS: "ROTAS",
  WEBSITE_CLICKS: "CLIQUES_NO_SITE",
  BUSINESS_CONVERSATIONS: "CONVERSAS",
  BUSINESS_BOOKINGS: "RESERVAS",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "VISUALIZACOES_MAPS_CELULAR",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "VISUALIZACOES_MAPS_COMPUTADOR",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "VISUALIZACOES_BUSCA_CELULAR",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "VISUALIZACOES_BUSCA_COMPUTADOR",
} as const;

/** A rodada relê duas semanas: o Google continua acertando os números dos últimos dias. */
export const DIAS_DA_RODADA = 14;
/** Ao escolher o perfil: um ano e meio, o que o Google guarda. */
export const DIAS_DO_HISTORICO = 540;

export type MetricaDoGoogle = keyof typeof METRICAS_DO_PERFIL;
export type MetricaDoPerfil = (typeof METRICAS_DO_PERFIL)[MetricaDoGoogle];

export const METRICAS_PEDIDAS = Object.keys(METRICAS_DO_PERFIL) as MetricaDoGoogle[];

/** As visualizações, que a tela mostra somadas. */
export const VISUALIZACOES: MetricaDoPerfil[] = [
  "VISUALIZACOES_MAPS_CELULAR",
  "VISUALIZACOES_MAPS_COMPUTADOR",
  "VISUALIZACOES_BUSCA_CELULAR",
  "VISUALIZACOES_BUSCA_COMPUTADOR",
];

/** O corpo de `fetchMultiDailyMetricsTimeSeries`, como a documentação descreve. */
export interface RespostaDasMetricas {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: {
      dailyMetric?: string;
      timeSeries?: { datedValues?: { date?: { year?: number; month?: number; day?: number }; value?: string }[] };
    }[];
  }[];
}

export interface LinhaDoPerfil {
  metrica: MetricaDoPerfil;
  /** AAAA-MM-DD */
  dia: string;
  valor: number;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Uma linha por métrica e por dia, com o último dia em que alguma métrica
 * teve número.
 *
 * O Google omite `value` quando o número é zero, e o dia sem valor vira zero.
 * Mas os dias mais recentes também podem chegar sem valor enquanto o Google
 * não fecha a conta (uns três dias de atraso), e zero ali seria mentira. Quem
 * lê o trecho mais novo corta em `ultimoComNumero`: um perfil ativo tem
 * visualização todo dia, então esse é o fim real do que o Google já contou.
 */
export function linhasDaResposta(resposta: RespostaDasMetricas): { linhas: LinhaDoPerfil[]; ultimoComNumero: string | null } {
  const linhas: LinhaDoPerfil[] = [];
  let ultimoComNumero: string | null = null;

  for (const grupo of resposta.multiDailyMetricTimeSeries ?? []) {
    for (const serie of grupo.dailyMetricTimeSeries ?? []) {
      const metrica = METRICAS_DO_PERFIL[serie.dailyMetric as MetricaDoGoogle];
      if (!metrica) continue;
      for (const ponto of serie.timeSeries?.datedValues ?? []) {
        const { year, month, day } = ponto.date ?? {};
        // Sem dia é número do mês inteiro, que a série diária não usa.
        if (!year || !month || !day) continue;
        const dia = `${year}-${doisDigitos(month)}-${doisDigitos(day)}`;
        const valor = ponto.value === undefined ? 0 : Number(ponto.value);
        if (!Number.isFinite(valor) || valor < 0) continue;
        linhas.push({ metrica, dia, valor });
        if (valor > 0 && (ultimoComNumero === null || dia > ultimoComNumero)) ultimoComNumero = dia;
      }
    }
  }

  return { linhas, ultimoComNumero };
}
