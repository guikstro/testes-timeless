import { ConversationCoverage } from "@prisma/client";
import { extractRevenueCents } from "../common/utils/extract-revenue-cents";
import { matchesTriggerPhrase } from "../common/utils/matches-trigger-phrase";

export interface SaleClassification {
  saleLikely: boolean;
  confidence: number;
  valueCents: number | null;
  currency: string;
  evidence: string[];
  reason: string;
  /** Venda condicionada a algo ainda por acontecer ("pago se der certo"): nunca confirma sozinha. */
  conditional?: boolean;
}
export abstract class SaleClassifier {
  abstract classify(input: {
    text: string;
    positive: string[];
    negative?: string[];
    currency: string;
    coverage: ConversationCoverage;
  }): SaleClassification | Promise<SaleClassification>;
}

/*
  O contexto é lido na frase em que a expressão de venda aparece, e não na
  mensagem inteira. Antes, qualquer "se", "não", "ainda" ou "orçamento" em
  qualquer ponto bloqueava: "Fechamos o orçamento de R$ 2.500" e "Fechado,
  ainda hoje faço o pix" nunca viravam venda.
*/

/** Negação logo antes da expressão: "não está fechado", "we haven't closed". */
const NEGACAO = /\b(n[aã]o|nunca|jamais|not|never|haven't|hasn't|didn't|couldn't|won't)\b/i;
/** Negação adiante na mesma frase que desmente o fato: "o contrato fechado ontem ainda não chegou". */
const AINDA_NAO = /\bainda\s+n[aã]o\b|\bnot\s+yet\b/i;
/** Dúvida na mesma frase: não é venda. */
const DUVIDA = /\b(talvez|maybe|perhaps|vou\s+pensar|pensar\s+melhor|decidir|vou\s+ver)\b/i;
/** Pergunta de preço na mesma frase: ainda é negociação. */
const PERGUNTA = /\b(quanto\s+cust|how\s+much)/i;
/** Condição: antes da expressão bloqueia ("se ficar fechado"); depois, só rebaixa ("fechado, pago se der certo"). */
const CONDICAO = /\b(se|caso|if|unless)\b/i;

/** Quantas palavras antes da expressão contam como "logo antes". */
const JANELA = 4;

const escape = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** As frases da mensagem, separadas por pontuação forte ou quebra de linha. */
function frases(texto: string): string[] {
  return texto.split(/[.!;\n]+/).map((f) => f.trim()).filter(Boolean);
}

type Leitura = "venda" | "condicional" | "nao";

/** Como a frase trata a expressão que bateu. */
function leFrase(frase: string, expressao: string): Leitura {
  const achado = new RegExp(`\\b${escape(expressao.trim())}\\b`, "i").exec(frase);
  if (!achado) return "nao";
  const antes = frase.slice(0, achado.index);
  const depois = frase.slice(achado.index + achado[0].length);
  const palavrasAntes = antes.split(/\s+/).filter(Boolean).slice(-JANELA).join(" ");

  if (/\?\s*$/.test(frase.trim()) || PERGUNTA.test(frase)) return "nao";
  if (NEGACAO.test(palavrasAntes) || AINDA_NAO.test(frase) || DUVIDA.test(frase)) return "nao";
  if (CONDICAO.test(antes)) return "nao";
  if (CONDICAO.test(depois)) return "condicional";
  return "venda";
}

export class DeterministicSaleClassifier extends SaleClassifier {
  classify(input: {
    text: string;
    positive: string[];
    negative?: string[];
    currency: string;
    coverage: ConversationCoverage;
  }): SaleClassification {
    const signals = input.positive.filter((phrase) => matchesTriggerPhrase(input.text, phrase));
    const negativaDoCliente = (input.negative ?? []).some((s) => matchesTriggerPhrase(input.text, s));

    // A melhor leitura entre as frases em que alguma expressão aparece.
    let leitura: Leitura = "nao";
    for (const frase of frases(input.text)) {
      for (const expressao of signals) {
        const desta = leFrase(frase, expressao);
        if (desta === "venda") leitura = "venda";
        else if (desta === "condicional" && leitura === "nao") leitura = "condicional";
      }
    }
    const saleLikely = signals.length > 0 && !negativaDoCliente && leitura !== "nao";

    const porCobertura = input.coverage === "COMPLETE" ? 0.85 : input.coverage === "PARTIAL" ? 0.65 : 0.55;
    // Condicional nunca passa de "possível": precisa de confirmação.
    const confidence = !saleLikely ? 0 : leitura === "condicional" ? Math.min(porCobertura, 0.5) : porCobertura;

    return {
      saleLikely,
      confidence,
      valueCents: extractRevenueCents(input.text),
      currency: input.currency,
      evidence: signals,
      conditional: saleLikely && leitura === "condicional",
      reason: !signals.length
        ? "Nenhuma expressão de venda."
        : !saleLikely
          ? "Negação, dúvida ou condição junto da expressão de venda: confirmação necessária."
          : leitura === "condicional"
            ? "Venda condicionada a algo ainda por acontecer: confirmação necessária."
            : "Sinais de venda na conversa.",
    };
  }
}
