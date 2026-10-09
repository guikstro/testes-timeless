export interface LeadParaGabarito {
  disqualifiedAt: Date | null;
  sales: { status: string; confirmationSource: string; deletedAt: Date | null }[];
}

/** Uma pessoa decidiu (VENDA ou SEM_VENDA), ou ninguém decidiu (null). */
export type Humano = "VENDA" | "SEM_VENDA" | null;

export interface Gabarito {
  /**
   * O que uma pessoa confirmou. É a única "resposta certa" de verdade:
   * venda confirmada por uma fonte que não é a conversa (manual, CRM, API,
   * pagamento), ou lead descartado/venda rejeitada à mão.
   */
  humano: Humano;
  /** O que o sistema de hoje acha, inclusive o que só a regra de palavras detectou. */
  sistema: "VENDA" | "SEM_VENDA";
}

/**
 * Separa o que uma pessoa decidiu do que a regra de palavras detectou. Uma
 * venda confirmada só pela conversa (a regra) NÃO conta como resposta certa:
 * ela é justamente o que o teste quer julgar.
 */
export function derivaGabarito(lead: LeadParaGabarito): Gabarito {
  const ativas = lead.sales.filter((s) => s.deletedAt === null);
  const confirmadaPorPessoaOuFonte = ativas.some((s) => s.status === "CONFIRMED" && s.confirmationSource !== "CONVERSATION");
  const rejeitada = ativas.some((s) => s.status === "REJECTED");

  const humano: Humano = confirmadaPorPessoaOuFonte
    ? "VENDA"
    : rejeitada || lead.disqualifiedAt !== null
      ? "SEM_VENDA"
      : null;
  const sistema = ativas.some((s) => s.status !== "REJECTED" && s.status !== "CANCELLED") ? "VENDA" : "SEM_VENDA";
  return { humano, sistema };
}
