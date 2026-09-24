import { MetaAcao } from "./meta-graph-types";

/**
 * O tipo de resultado que a Meta usa para "conversa iniciada" num anúncio que
 * abre o WhatsApp. É o mesmo número da coluna "Conversas por mensagem
 * iniciadas" do Gerenciador de Anúncios.
 */
export const ACAO_CONVERSA_INICIADA = "onsite_conversion.messaging_conversation_started_7d";

/**
 * Quantas conversas a Meta diz que uma linha de desempenho iniciou.
 *
 * Zero quando o tipo não aparece, e não null: as ações são pedidas junto do
 * gasto, e a Meta só devolve os tipos que aconteceram. Um valor que não é
 * número também vira zero, porque uma linha mal formada não pode inventar
 * conversa.
 */
export function conversasIniciadasDe(acoes: MetaAcao[] | undefined): number {
  const linha = acoes?.find((acao) => acao.action_type === ACAO_CONVERSA_INICIADA);
  if (!linha) return 0;
  const valor = Number(linha.value);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : 0;
}

/**
 * Data como a Meta escreve, "2026-09-24T12:48:04+0000".
 *
 * O fuso vem sem os dois pontos, forma que nem todo leitor de data aceita; é
 * normalizado antes de ler. Qualquer coisa ilegível vira null, e não a data de
 * hoje, que seria uma data falsa com cara de verdadeira.
 */
export function dataDaMeta(valor: string | undefined): Date | null {
  if (!valor) return null;
  const normalizado = valor.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const data = new Date(normalizado);
  return Number.isNaN(data.getTime()) ? null : data;
}
