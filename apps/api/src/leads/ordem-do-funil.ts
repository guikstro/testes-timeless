import { LeadStatus } from "@prisma/client";

/**
 * A ordem do funil, num lugar só: o serviço de leads e o classificador
 * decidem "só avança" pela mesma régua. Eram duas cópias, e um estágio novo
 * numa delas só faria as duas discordarem sobre para onde o lead pode ir.
 *
 * Em atendimento fica entre Novo e Qualificado: a equipe respondeu, mas isso
 * não diz nada sobre o lead ser oportunidade.
 */
export const ORDEM_DO_FUNIL: Record<LeadStatus, number> = {
  NEW: 0,
  IN_PROGRESS: 1,
  QUALIFIED: 2,
  MEETING_SCHEDULED: 3,
  WON: 4,
};

/**
 * Os estágios que contam como qualificado nos números. Quem marcou reunião ou
 * comprou passou pela qualificação, mesmo que o status tenha pulado direto.
 * Em atendimento não conta: responder não qualifica ninguém.
 */
export const ESTAGIOS_QUALIFICADOS: ReadonlySet<LeadStatus> = new Set<LeadStatus>(["QUALIFIED", "MEETING_SCHEDULED", "WON"]);
