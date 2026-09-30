/**
 * Vocabulário do funil, num módulo neutro.
 *
 * Não pode viver no `lead-board.tsx`: aquele arquivo é de cliente, e um
 * componente de servidor que importa dele recebe uma referência para o
 * navegador, não o valor. Uma constante importada assim chega indefinida em
 * tempo de execução, mesmo com o tipo parecendo certo em compilação.
 */
export const ESTAGIOS = ["NEW", "IN_PROGRESS", "QUALIFIED", "MEETING_SCHEDULED", "WON"] as const;

export type Estagio = (typeof ESTAGIOS)[number];

/**
 * Ordem do funil. Só anda para frente. Em atendimento fica entre Novo e
 * Qualificado: a equipe respondeu, o que ainda não diz se é oportunidade.
 */
export const ORDEM: Record<Estagio, number> = {
  NEW: 0,
  IN_PROGRESS: 1,
  QUALIFIED: 2,
  MEETING_SCHEDULED: 3,
  WON: 4,
};

export const APARENCIA: Record<Estagio, { titulo: string; cor: string }> = {
  NEW: { titulo: "Novos", cor: "bg-slate-400" },
  IN_PROGRESS: { titulo: "Em atendimento", cor: "bg-amber-400" },
  QUALIFIED: { titulo: "Qualificados", cor: "bg-sky-500" },
  MEETING_SCHEDULED: { titulo: "Reunião marcada", cor: "bg-violet-500" },
  WON: { titulo: "Vendas", cor: "bg-emerald-500" },
};
