/**
 * Se os números de lead de um período são medida ou ausência de medida.
 *
 * O lead nasce da mensagem que chega no WhatsApp conectado. Sem WhatsApp, a
 * tela mostrava "0 leads" e "retorno 0,00x", e isso é uma afirmação falsa:
 * zero é o sistema dizendo que ninguém escreveu, quando o caso é que ele não
 * tinha como saber. Uma conta com anúncio rodando e WhatsApp desligado lia
 * que a campanha não trazia ninguém, e a Meta dizendo o contrário.
 *
 * A regra nunca esconde um número real: havendo lead no período, ele é
 * medida, venha de onde vier. Só o zero é posto em dúvida.
 */

export interface ConexaoParaMedicao {
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
  /** Quando o WhatsApp foi configurado pela primeira vez nesta conta. */
  createdAt: string;
}

export type Medicao =
  /** O número é o que aconteceu, inclusive quando é zero. */
  | "medido"
  /** Nenhum WhatsApp foi configurado nesta conta. */
  | "sem-whatsapp"
  /** O período terminou antes de o WhatsApp ser configurado. */
  | "antes-do-whatsapp"
  /** Há WhatsApp configurado, mas ele não está conectado agora. */
  | "whatsapp-fora";

/** Dia civil em Brasília de um instante, no formato do período. */
function diaEmBrasilia(instante: string): string {
  // en-CA escreve AAAA-MM-DD, o mesmo formato dos períodos.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante));
}

export function medicaoDeLeads({
  conexao,
  ate,
  leads,
}: {
  /**
   * Null é "não há WhatsApp configurado". Undefined é "não foi possível ler":
   * nesse caso o número fica como veio, porque uma falha de consulta não pode
   * virar um aviso de que o cliente não configurou nada.
   */
  conexao: ConexaoParaMedicao | null | undefined;
  /** Último dia do período, AAAA-MM-DD. */
  ate: string;
  leads: number;
}): Medicao {
  if (leads > 0 || conexao === undefined) return "medido";
  if (conexao === null) return "sem-whatsapp";
  if (ate < diaEmBrasilia(conexao.createdAt)) return "antes-do-whatsapp";
  if (conexao.status !== "CONNECTED") return "whatsapp-fora";
  return "medido";
}

/** Dia em que a medição começou, para a tela poder dizer desde quando. */
export function inicioDaMedicao(conexao: ConexaoParaMedicao): string {
  return diaEmBrasilia(conexao.createdAt);
}

/** O dia de hoje em Brasília, para telas sem período como Leads e Conversas. */
export function hojeEmBrasilia(agora = new Date()): string {
  return diaEmBrasilia(agora.toISOString());
}
