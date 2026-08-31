import { AttributionMethod, LeadStatus } from "@prisma/client";

/**
 * Agregação do dashboard.
 *
 * Fica fora do service por ser lógica pura sobre uma lista de leads — dá para
 * testar todos os casos de borda (período sem lead, venda sem valor, link sem
 * nome) sem tocar no banco.
 */

/** Só o que a agregação lê. */
export interface AggregationLead {
  status: LeadStatus;
  firstContactAt: Date;
  /** Fonte da verdade para "teve reunião": o status avança para WON depois, mas a data fica. */
  meetingScheduledAt: Date | null;
  disqualifiedAt: Date | null;
  attribution: {
    method: AttributionMethod;
    trackingClick: { utmSource: string | null; trackingLink: { name: string } | null } | null;
  } | null;
  sale: { amountCents: number | null } | null;
}

export interface OriginBucket {
  key: string;
  label: string;
  leads: number;
  qualified: number;
  meetings: number;
  won: number;
  disqualified: number;
  revenueCents: number;
}

export interface DailyPoint {
  date: string;
  leads: number;
  won: number;
}

export interface OverviewTotals {
  leads: number;
  /** Descartados como não-oportunidade. Saem do denominador das taxas. */
  disqualified: number;
  /** Leads menos descartados: a base sobre a qual as taxas fazem sentido. */
  workable: number;
  qualified: number;
  meetings: number;
  won: number;
  revenueCents: number;
  /** Null sem base para calcular: 0% diria que ninguém converteu, o que é diferente de "não houve ninguém". */
  qualificationRate: number | null;
  /** Sobre os qualificados, não sobre o total — é essa a pergunta de quem vende. */
  closeRate: number | null;
}

const UNKNOWN_ORIGIN = { key: "unknown", label: "Sem origem identificada" };
const CTWA_ORIGIN = { key: "meta_ctwa", label: "Anúncio Meta (Click-to-WhatsApp)" };

/**
 * A que origem um lead pertence.
 *
 * Todo lead deste produto nasce de uma mensagem de WhatsApp — é o único
 * caminho de criação. Então "de onde veio" nunca é o canal, e sim a evidência
 * de atribuição: um anúncio da Meta, um link rastreável nosso, ou nada.
 *
 * Links são agrupados pelo nome que o próprio usuário deu, porque é assim que
 * ele pensa na origem; o `utm_source` entra só como segunda opção, para links
 * criados fora da tela de links.
 */
export function classifyOrigin(lead: AggregationLead): { key: string; label: string } {
  const attribution = lead.attribution;
  if (!attribution || attribution.method === "UNKNOWN") return UNKNOWN_ORIGIN;
  if (attribution.method === "CTWA_REFERRAL") return CTWA_ORIGIN;

  const click = attribution.trackingClick;
  const name = click?.trackingLink?.name?.trim() || click?.utmSource?.trim();
  if (!name) return { key: "link:sem-nome", label: "Link rastreável sem nome" };
  return { key: `link:${name.toLowerCase()}`, label: name };
}

export function aggregateTotals(leads: AggregationLead[]): OverviewTotals {
  const disqualified = leads.filter((lead) => lead.disqualifiedAt !== null).length;
  const qualified = leads.filter((lead) => lead.status !== "NEW").length;
  const meetings = leads.filter((lead) => lead.meetingScheduledAt !== null).length;
  const won = leads.filter((lead) => lead.status === "WON").length;
  const revenueCents = leads.reduce((sum, lead) => sum + (lead.sale?.amountCents ?? 0), 0);

  // Leads descartados saem do denominador: eles nunca foram oportunidade, e
  // mantê-los ali faria a taxa de qualificação cair como se fossem negócios
  // perdidos. O total continua exposto ao lado para a conta ser conferível.
  const workable = leads.length - disqualified;

  return {
    leads: leads.length,
    disqualified,
    workable,
    qualified,
    meetings,
    won,
    revenueCents,
    qualificationRate: workable > 0 ? qualified / workable : null,
    closeRate: qualified > 0 ? won / qualified : null,
  };
}

export function aggregateByOrigin(leads: AggregationLead[]): OriginBucket[] {
  const buckets = new Map<string, OriginBucket>();

  for (const lead of leads) {
    const { key, label } = classifyOrigin(lead);
    const bucket = buckets.get(key) ?? {
      key,
      label,
      leads: 0,
      qualified: 0,
      meetings: 0,
      won: 0,
      disqualified: 0,
      revenueCents: 0,
    };

    bucket.leads += 1;
    // Qualquer estágio além de NEW conta como qualificado: quem comprou ou
    // marcou reunião passou por lá, mesmo que o status tenha pulado direto.
    if (lead.status !== "NEW") bucket.qualified += 1;
    if (lead.meetingScheduledAt !== null) bucket.meetings += 1;
    if (lead.status === "WON") bucket.won += 1;
    if (lead.disqualifiedAt !== null) bucket.disqualified += 1;
    bucket.revenueCents += lead.sale?.amountCents ?? 0;

    buckets.set(key, bucket);
  }

  // Mais leads primeiro; a origem desconhecida por último mesmo quando é a
  // maior, porque ela é o resíduo, não um canal a ser comemorado.
  return [...buckets.values()].sort((a, b) => {
    if (a.key === UNKNOWN_ORIGIN.key) return 1;
    if (b.key === UNKNOWN_ORIGIN.key) return -1;
    return b.leads - a.leads;
  });
}

/** Data no fuso local, não em UTC: um lead das 21h em Brasília é de hoje, não de amanhã. */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Série diária contínua: dias sem lead entram com zero em vez de sumirem, para
 * o gráfico não comprimir o eixo e sugerir um fluxo constante que não houve.
 */
export function aggregateDaily(leads: AggregationLead[], from: Date, to: Date): DailyPoint[] {
  const points = new Map<string, DailyPoint>();

  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= last) {
    points.set(toLocalDateKey(cursor), { date: toLocalDateKey(cursor), leads: 0, won: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const lead of leads) {
    const point = points.get(toLocalDateKey(lead.firstContactAt));
    // Um lead fora da janela não cria um ponto novo — a série é o período pedido.
    if (!point) continue;
    point.leads += 1;
    if (lead.status === "WON") point.won += 1;
  }

  return [...points.values()];
}
