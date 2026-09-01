/**
 * Vocabulário do funil, num módulo neutro.
 *
 * Não pode viver no `lead-board.tsx`: aquele arquivo é de cliente, e um
 * componente de servidor que importa dele recebe uma referência para o
 * navegador, não o valor. Uma constante importada assim chega indefinida em
 * tempo de execução, mesmo com o tipo parecendo certo em compilação.
 */
export const ESTAGIOS = ["NEW", "QUALIFIED", "MEETING_SCHEDULED", "WON"] as const;

export type Estagio = (typeof ESTAGIOS)[number];

/** Ordem do funil. Só anda para frente. */
export const ORDEM: Record<Estagio, number> = {
  NEW: 0,
  QUALIFIED: 1,
  MEETING_SCHEDULED: 2,
  WON: 3,
};

export const APARENCIA: Record<Estagio, { titulo: string; cor: string }> = {
  NEW: { titulo: "Novos", cor: "bg-slate-400" },
  QUALIFIED: { titulo: "Qualificados", cor: "bg-sky-500" },
  MEETING_SCHEDULED: { titulo: "Reunião marcada", cor: "bg-violet-500" },
  WON: { titulo: "Vendas", cor: "bg-emerald-500" },
};
