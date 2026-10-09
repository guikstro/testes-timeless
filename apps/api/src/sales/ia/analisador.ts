import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnaliseDaConversa, sanitizaAnalise } from "./analise";
import { validaCitacoes } from "./citacoes";
import { MODELOS } from "./custo";
import { montaMensagemDoUsuario, PROMPT_DO_SISTEMA } from "./prompt";

/** Só o que o analisador usa do cliente, para o teste poder trocá-lo por um falso. */
export type ClienteDaIA = Pick<Anthropic, "messages">;

export interface ResultadoDaAnalise {
  analise: AnaliseDaConversa | null;
  /** O motivo, quando não veio análise: recusa, resposta fora do formato, erro da API. */
  erro?: string;
  tokensEntrada: number;
  tokensSaida: number;
  ms: number;
  /** Trechos citados que existem na conversa, e os que a IA inventou. */
  citacoes: { validas: string[]; invalidas: string[] };
}

/** Só os modelos 5.5 aceitam o nível de esforço; o Haiku 4.5 recusa o parâmetro. */
const aceitaEsforco = (modelo: string) => modelo === MODELOS.sonnet || modelo === MODELOS.opus;

/**
 * Pede à IA a análise de uma conversa e confere a resposta.
 *
 * Esforço baixo: é classificação, e o raciocínio extra aumenta o custo sem
 * mudar o veredito na maioria dos casos. O teste existe para confirmar isso.
 * `max_tokens` folgado porque o raciocínio conta na saída.
 */
export async function analisarConversa(args: {
  client: ClienteDaIA;
  modelo: string;
  transcricao: string;
  dicas?: string[];
}): Promise<ResultadoDaAnalise> {
  const { client, modelo, transcricao, dicas } = args;
  const inicio = Date.now();
  const vazio = { validas: [], invalidas: [] };

  try {
    const resposta = await client.messages.parse({
      model: modelo,
      max_tokens: 4096,
      system: PROMPT_DO_SISTEMA,
      messages: [{ role: "user", content: montaMensagemDoUsuario(transcricao, dicas) }],
      output_config: {
        format: zodOutputFormat(AnaliseDaConversa),
        ...(aceitaEsforco(modelo) ? { effort: "low" as const } : {}),
      },
    });

    const uso = { tokensEntrada: resposta.usage.input_tokens, tokensSaida: resposta.usage.output_tokens, ms: Date.now() - inicio };
    if (resposta.stop_reason === "refusal") return { analise: null, erro: "A IA recusou analisar esta conversa.", citacoes: vazio, ...uso };
    if (!resposta.parsed_output) {
      return { analise: null, erro: `Resposta fora do formato (parou por ${resposta.stop_reason}).`, citacoes: vazio, ...uso };
    }

    const analise = sanitizaAnalise(resposta.parsed_output);
    return { analise, citacoes: validaCitacoes(analise.evidencias, transcricao), ...uso };
  } catch (erro) {
    return {
      analise: null,
      erro: erro instanceof Error ? erro.message.slice(0, 300) : "Erro desconhecido.",
      tokensEntrada: 0,
      tokensSaida: 0,
      ms: Date.now() - inicio,
      citacoes: vazio,
    };
  }
}

/** Roda `trabalho` sobre os itens, `limite` por vez, mantendo a ordem do resultado. */
export async function executaEmParalelo<T, R>(
  itens: T[],
  limite: number,
  trabalho: (item: T, indice: number) => Promise<R>,
  aoTerminar?: (feitos: number, total: number) => void,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  let feitos = 0;

  async function operario() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await trabalho(itens[indice], indice);
      feitos += 1;
      aoTerminar?.(feitos, itens.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, operario));
  return resultados;
}
