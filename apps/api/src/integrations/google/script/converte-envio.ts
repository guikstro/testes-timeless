/**
 * O que o script do Google Ads manda, convertido para o que o sistema guarda.
 *
 * O Google escreve dinheiro em micros (1 real = 1.000.000) e o sistema em
 * centavos. A conversão arredonda, e nunca guarda ponto flutuante de dinheiro:
 * é um número que o cliente usa para decidir investimento.
 */

export interface DiaDoScript {
  data: string;
  custoMicros: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  valorConversoes: number;
}

export interface CampanhaDoScript {
  id: string;
  nome: string;
  status: string;
  orcamentoMicros?: number | null;
  dias: DiaDoScript[];
}

export interface GastoDoDia {
  data: Date;
  spendCents: number;
  impressoes: number;
  cliques: number;
  conversoesNaPlataforma: number;
  valorConversoesCentavos: number;
}

export interface CampanhaConvertida {
  externalId: string;
  nome: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  orcamentoDiarioCentavos: number | null;
  dias: GastoDoDia[];
}

/** O status do Google no vocabulário que o resto do sistema já usa (o da Meta). */
const STATUS: Record<string, CampanhaConvertida["status"]> = {
  ENABLED: "ACTIVE",
  PAUSED: "PAUSED",
  REMOVED: "ARCHIVED",
};

export const microsParaCentavos = (micros: number) => Math.round(micros / 10_000);

export function converteCampanha(campanha: CampanhaDoScript): CampanhaConvertida {
  // O mesmo dia pode vir repetido se o script rodar em cima de outra rodada;
  // o último vence, igual ao lançamento à mão.
  const porDia = new Map<string, GastoDoDia>();
  for (const dia of campanha.dias) {
    porDia.set(dia.data, {
      data: new Date(`${dia.data}T00:00:00.000Z`),
      spendCents: microsParaCentavos(dia.custoMicros),
      impressoes: dia.impressoes,
      cliques: dia.cliques,
      // Duas casas bastam: o Google mostra assim, e mais que isso é ruído.
      conversoesNaPlataforma: Math.round(dia.conversoes * 100) / 100,
      valorConversoesCentavos: Math.round(dia.valorConversoes * 100),
    });
  }

  return {
    externalId: campanha.id,
    nome: campanha.nome.trim(),
    status: STATUS[campanha.status] ?? "PAUSED",
    orcamentoDiarioCentavos:
      campanha.orcamentoMicros === null || campanha.orcamentoMicros === undefined
        ? null
        : microsParaCentavos(campanha.orcamentoMicros),
    dias: [...porDia.values()],
  };
}

/** O id da conta como o Google Ads mostra na tela: 123-456-7890. */
export function contaLegivel(customerId: string): string {
  const digitos = customerId.replace(/\D/g, "");
  return digitos.length === 10 ? `${digitos.slice(0, 3)}-${digitos.slice(3, 6)}-${digitos.slice(6)}` : customerId;
}
