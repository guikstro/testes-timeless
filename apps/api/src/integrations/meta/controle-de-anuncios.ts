import { MembershipRole } from "@prisma/client";
import { SituacaoDaVerba } from "../../budgets/calculo-da-verba";

/**
 * As regras de quem pode escrever na conta de anúncios, e do que a escrita
 * não pode fazer em silêncio.
 *
 * Todas puras e neste arquivo de propósito. Escrever na conta move o dinheiro
 * do cliente, e uma regra escondida dentro de um serviço que também fala HTTP
 * com a Meta é uma regra que ninguém consegue testar nem revisar direito.
 */

/**
 * Quem pode mexer.
 *
 * MEMBER lê tudo e não escreve nada. A leitura é o trabalho diário de quem
 * atende; desligar um criativo ou mudar um orçamento é decisão de quem
 * responde pela conta. Um erro aqui não gera um relatório errado, gera uma
 * cobrança errada.
 */
export function podeEscreverNaConta(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export type StatusNaMeta = "ACTIVE" | "PAUSED";

export interface MudancaDeStatus {
  /** False quando o objeto já está no estado pedido. */
  precisaEscrever: boolean;
  de: string;
  para: StatusNaMeta;
}

/**
 * Pausar o que já está pausado não é erro, é trabalho já feito.
 *
 * Devolver erro aqui faria a tela piscar vermelho para quem clicou duas vezes,
 * ou para dois operadores agindo juntos. Mas também não se escreve à toa: uma
 * chamada desnecessária à Meta é uma linha a mais no histórico dizendo que
 * alguém mudou algo que não mudou.
 */
export function planejaMudancaDeStatus(statusAtual: string, desejado: StatusNaMeta): MudancaDeStatus {
  return {
    precisaEscrever: statusAtual.toUpperCase() !== desejado,
    de: statusAtual,
    para: desejado,
  };
}

export type VeredictoDoOrcamento =
  | { permitido: true; aviso: null }
  | { permitido: true; aviso: string }
  | { permitido: false; motivo: string };

/** Piso da Meta para orçamento diário em BRL. Abaixo disto a API recusa. */
const MINIMO_DIARIO_CENTAVOS = 500;

/**
 * O orçamento diário pedido cabe na verba combinada?
 *
 * Esta é a única coisa que este produto faz e o gerenciador da Meta não faz: a
 * Meta não sabe quanto foi combinado com o cliente, então ela aceita qualquer
 * diário sem piscar. Aqui, um diário que consome o saldo antes do fim do
 * período é recusado por padrão.
 *
 * Recusado, e não só avisado. Um aviso que não bloqueia é lido como enfeite
 * depois da terceira vez, e o custo de ignorá-lo é a verba do cliente estourar
 * no dia vinte. Quem quer mesmo assim confirma de propósito, e a confirmação
 * fica no histórico dizendo que foi deliberado.
 */
export function confereOrcamentoDiario(
  novoCentavos: number,
  verba: SituacaoDaVerba | null,
  confirmado: boolean,
): VeredictoDoOrcamento {
  if (!Number.isInteger(novoCentavos) || novoCentavos < MINIMO_DIARIO_CENTAVOS) {
    return {
      permitido: false,
      motivo: `O orçamento diário mínimo é de R$ ${(MINIMO_DIARIO_CENTAVOS / 100).toFixed(2).replace(".", ",")}.`,
    };
  }

  /*
    Sem verba declarada não há regra a aplicar, e inventar um teto seria pior
    que não ter nenhum. A tela convida a declarar a verba em outro lugar.
  */
  if (!verba) {
    return { permitido: true, aviso: null };
  }

  if (verba.saldoCentavos <= 0) {
    return confirmado
      ? { permitido: true, aviso: "A verba já foi consumida por inteiro." }
      : { permitido: false, motivo: "A verba do período já acabou. Declare uma nova verba ou confirme o estouro." };
  }

  /*
    Verba sem fim declarado vale até acabar, então nenhum diário a estoura
    "antes do prazo": não há prazo. O que dá para dizer é em quantos dias ela
    acaba, e isso é aviso, não impedimento.
  */
  if (verba.diasRestantes === null) {
    const dias = Math.floor(verba.saldoCentavos / novoCentavos);
    return {
      permitido: true,
      aviso: `Nesse diário a verba dura cerca de ${dias} ${dias === 1 ? "dia" : "dias"}.`,
    };
  }

  // Contando hoje: o diário de hoje ainda vai ser cobrado.
  const diasAteOFim = verba.diasRestantes + 1;
  const projetado = novoCentavos * diasAteOFim;

  if (projetado <= verba.saldoCentavos) {
    return { permitido: true, aviso: null };
  }

  const cabe = Math.floor(verba.saldoCentavos / diasAteOFim);
  const duraria = Math.floor(verba.saldoCentavos / novoCentavos);

  if (confirmado) {
    return {
      permitido: true,
      aviso: `Estouro confirmado: nesse diário a verba acaba em ${duraria} ${duraria === 1 ? "dia" : "dias"}, e faltam ${diasAteOFim}.`,
    };
  }

  return {
    permitido: false,
    motivo:
      `Esse diário consome a verba em ${duraria} ${duraria === 1 ? "dia" : "dias"}, e ainda faltam ${diasAteOFim}. ` +
      `Para chegar até o fim, o teto é R$ ${(cabe / 100).toFixed(2).replace(".", ",")} por dia.`,
  };
}
