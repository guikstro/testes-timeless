/**
 * A saúde da conta de anúncios, lida do jeito que a Meta a reporta.
 *
 * Existe porque a verba combinada e o dinheiro que a Meta tem são duas coisas
 * diferentes, e confundi-las é o erro mais caro desta tela: o cliente pode ter
 * cinco mil combinados e a conta estar suspensa, ou ter verba de sobra e o
 * cartão ter sido recusado ontem. Nenhuma das duas situações aparece no
 * relatório de gasto, porque nas duas o gasto simplesmente para.
 *
 * Três armadilhas nos dados da Meta, e este arquivo existe em boa parte para
 * não cair nelas:
 *
 * 1. **`spend_cap` igual a zero quer dizer SEM TETO**, não teto esgotado.
 *    Tratar o zero como limite inverteria o sentido por completo.
 * 2. **`amount_spent` não é o gasto do mês.** É o acumulado contra o teto, e
 *    zera quando o teto é redefinido. Mostrá-lo como gasto do período daria um
 *    número que não bate com nenhum outro da tela.
 * 3. **Os valores vêm em texto**, na menor unidade da moeda. Chegam como
 *    `"150000"` e não como número.
 */

export type GravidadeDaConta = "ok" | "atencao" | "parada";

export interface StatusDaConta {
  codigo: number;
  rotulo: string;
  gravidade: GravidadeDaConta;
  /** O que fazer, quando há o que fazer. */
  oQueFazer: string | null;
}

/**
 * Os códigos de `account_status` documentados pela Meta.
 *
 * O código desconhecido não vira "ok". Uma conta num estado que este produto
 * não conhece é exatamente o caso em que não dá para afirmar que está tudo
 * bem, e o padrão seguro é pedir para olhar.
 */
const STATUS: Record<number, Omit<StatusDaConta, "codigo">> = {
  1: { rotulo: "Ativa", gravidade: "ok", oQueFazer: null },
  2: {
    rotulo: "Desativada",
    gravidade: "parada",
    oQueFazer: "A Meta desativou a conta. Nenhum anúncio roda até isso ser resolvido no Gerenciador.",
  },
  3: {
    rotulo: "Pendência de pagamento",
    gravidade: "parada",
    oQueFazer: "Há fatura em aberto. A veiculação para até o pagamento ser aceito.",
  },
  7: {
    rotulo: "Em análise de risco",
    gravidade: "atencao",
    oQueFazer: "A Meta está revisando a conta. Costuma se resolver sozinho, mas a veiculação pode parar.",
  },
  8: {
    rotulo: "Aguardando liquidação",
    gravidade: "atencao",
    oQueFazer: "Um pagamento está em processamento.",
  },
  9: {
    rotulo: "Em período de carência",
    gravidade: "atencao",
    oQueFazer: "A conta segue rodando por prazo limitado. Regularize o pagamento antes do fim do prazo.",
  },
  100: {
    rotulo: "Em encerramento",
    gravidade: "parada",
    oQueFazer: "A conta foi marcada para encerrar.",
  },
  101: { rotulo: "Encerrada", gravidade: "parada", oQueFazer: "Esta conta de anúncios foi encerrada." },
  201: { rotulo: "Ativa", gravidade: "ok", oQueFazer: null },
  202: { rotulo: "Encerrada", gravidade: "parada", oQueFazer: "Esta conta de anúncios foi encerrada." },
};

export function leituraDoStatusDaConta(codigo: number | null): StatusDaConta | null {
  // Nunca lido é diferente de estado ruim: a tela precisa dizer "ainda não sei".
  if (codigo === null) return null;

  const conhecido = STATUS[codigo];
  if (conhecido) return { codigo, ...conhecido };

  return {
    codigo,
    rotulo: `Estado ${codigo}`,
    gravidade: "atencao",
    oQueFazer: "A Meta reportou um estado que este painel ainda não reconhece. Confira no Gerenciador.",
  };
}

export interface SaudeDaConta {
  nome: string | null;
  moeda: string | null;
  status: StatusDaConta | null;
  /** Teto de gasto da conta. Null quando não há teto definido. */
  tetoCentavos: number | null;
  /** Acumulado contra o teto. **Não** é o gasto do período. */
  acumuladoCentavos: number | null;
  /** Quanto falta para bater no teto. Null sem teto. */
  restanteDoTetoCentavos: number | null;
  /** De 0 a 100. Null sem teto definido. */
  tetoConsumidoPorCento: number | null;
  /** Saldo pré-pago, quando a conta é desse tipo. */
  saldoCentavos: number | null;
  lidoEm: string | null;
  /** A pior notícia da conta, para a tela saber que cor usar. */
  gravidade: GravidadeDaConta;
}

export interface LinhasDaConta {
  accountName: string | null;
  currency: string | null;
  accountStatus: number | null;
  spendCapCents: number | null;
  amountSpentCents: number | null;
  balanceCents: number | null;
  healthSyncedAt: Date | null;
}

/** Perto do teto é notícia antes de bater nele: bater significa veiculação parada. */
const LIMIAR_DE_ATENCAO = 90;

export function montaSaudeDaConta(linhas: LinhasDaConta): SaudeDaConta {
  const status = leituraDoStatusDaConta(linhas.accountStatus);
  const teto = linhas.spendCapCents;
  const acumulado = linhas.amountSpentCents;

  const restanteDoTetoCentavos =
    teto !== null && acumulado !== null ? Math.max(0, teto - acumulado) : null;

  const tetoConsumidoPorCento =
    teto !== null && teto > 0 && acumulado !== null
      ? Math.round((acumulado / teto) * 1000) / 10
      : null;

  /*
    A gravidade é a pior das notícias, não a média delas.

    Uma conta ativa com o teto a noventa e cinco por cento não está bem; uma
    conta suspensa com teto folgado também não. Somar ou ponderar as duas
    esconderia justamente aquela que vai parar a veiculação.
  */
  const gravidades: GravidadeDaConta[] = [status?.gravidade ?? "atencao"];
  if (tetoConsumidoPorCento !== null && tetoConsumidoPorCento >= 100) gravidades.push("parada");
  else if (tetoConsumidoPorCento !== null && tetoConsumidoPorCento >= LIMIAR_DE_ATENCAO) gravidades.push("atencao");
  // Saldo pré-pago zerado para a conta do mesmo jeito que um teto batido.
  if (linhas.balanceCents !== null && linhas.balanceCents <= 0) gravidades.push("parada");

  return {
    nome: linhas.accountName,
    moeda: linhas.currency,
    status,
    tetoCentavos: teto,
    acumuladoCentavos: acumulado,
    restanteDoTetoCentavos,
    tetoConsumidoPorCento,
    saldoCentavos: linhas.balanceCents,
    lidoEm: linhas.healthSyncedAt?.toISOString() ?? null,
    gravidade: piorDe(gravidades),
  };
}

function piorDe(gravidades: GravidadeDaConta[]): GravidadeDaConta {
  if (gravidades.includes("parada")) return "parada";
  if (gravidades.includes("atencao")) return "atencao";
  return "ok";
}

/**
 * Converte o que a Graph API devolve para as colunas que guardamos.
 *
 * Os valores chegam em texto, na menor unidade da moeda. O `spend_cap` igual
 * a zero vira `null` aqui, no ponto mais próximo da fonte, para o resto do
 * sistema nunca precisar lembrar que zero quer dizer o contrário do que
 * parece.
 */
export function normalizaRespostaDaConta(bruto: {
  name?: string;
  currency?: string;
  account_status?: number;
  spend_cap?: string;
  amount_spent?: string;
  balance?: string;
}): LinhasDaConta {
  const teto = inteiroOuNulo(bruto.spend_cap);

  return {
    accountName: bruto.name ?? null,
    currency: bruto.currency ?? null,
    accountStatus: typeof bruto.account_status === "number" ? bruto.account_status : null,
    spendCapCents: teto === 0 ? null : teto,
    amountSpentCents: inteiroOuNulo(bruto.amount_spent),
    balanceCents: inteiroOuNulo(bruto.balance),
    healthSyncedAt: new Date(),
  };
}

function inteiroOuNulo(valor: string | undefined): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero) : null;
}
