import { z } from "zod";

/**
 * O que a IA devolve sobre uma conversa. Em formato fixo, para o código
 * conferir cada campo em vez de interpretar texto livre.
 */
export const SITUACOES = ["FECHADA", "PROMETIDA", "NEGOCIANDO", "PERDIDA", "SEM_VENDA"] as const;

/** Os mesmos motivos de perda do briefing (item 31), para a IA já falar a língua do produto. */
export const MOTIVOS_DE_PERDA = [
  "PRECO",
  "SEM_ORCAMENTO",
  "SEM_RESPOSTA",
  "CONCORRENTE",
  "FORA_DA_REGIAO",
  "LEAD_INVALIDO",
  "NAO_TEM_PERFIL",
  "MOMENTO",
  "DUPLICADO",
  "OUTRO",
  "NENHUM",
] as const;

export const QUALIDADES_DO_LEAD = ["BOM", "MEDIO", "RUIM", "SEM_DADOS"] as const;

export const AnaliseDaConversa = z.object({
  situacao: z.enum(SITUACOES).describe("Como a conversa terminou, pelo que está escrito nela."),
  confianca: z
    .number()
    .describe("De 0 a 1. Acima de 0,9 só quando o fechamento é inequívoco. Conversa curta ou cortada reduz."),
  valorEmCentavos: z
    .number()
    .int()
    .nullable()
    .describe("Valor fechado ou pago, em centavos (R$ 850 vira 85000). Null se a conversa não disser."),
  evidencias: z
    .array(z.string())
    .describe("Até 5 trechos LITERAIS e curtos da conversa que sustentam a decisão. Lista vazia se não houver."),
  motivoDaPerda: z.enum(MOTIVOS_DE_PERDA).describe("Só quando situacao é PERDIDA. Nos outros casos, NENHUM."),
  qualidadeDoLead: z.enum(QUALIDADES_DO_LEAD).describe("Se o lead tinha interesse real, perfil e condição de comprar."),
  motivo: z.string().describe("Uma ou duas frases, em português, explicando a decisão."),
});

export type AnaliseDaConversa = z.infer<typeof AnaliseDaConversa>;

/** Maior valor que o banco guarda em centavos (inteiro de 32 bits). */
const MAIOR_VALOR = 2_147_483_647;

/**
 * A resposta já veio no formato certo, mas o formato não impede um número
 * absurdo: limita a confiança e descarta valor negativo ou grande demais.
 */
export function sanitizaAnalise(analise: AnaliseDaConversa): AnaliseDaConversa {
  const confianca = Number.isFinite(analise.confianca) ? Math.min(1, Math.max(0, analise.confianca)) : 0;
  const valor = analise.valorEmCentavos;
  const valorValido = valor !== null && Number.isInteger(valor) && valor >= 0 && valor <= MAIOR_VALOR;
  return {
    ...analise,
    confianca,
    valorEmCentavos: valorValido ? valor : null,
    evidencias: analise.evidencias.slice(0, 5),
    motivoDaPerda: analise.situacao === "PERDIDA" ? analise.motivoDaPerda : "NENHUM",
  };
}

/** A IA acha que houve venda: fechada, ou aceita e esperando o pagamento. */
export function vendaSegundoAIA(analise: AnaliseDaConversa): boolean {
  return analise.situacao === "FECHADA" || analise.situacao === "PROMETIDA";
}
