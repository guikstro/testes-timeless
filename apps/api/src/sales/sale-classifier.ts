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
const NEGATIVE =
  /\b(n[aã]o|not|never|haven't|hasn't|didn't|couldn't|ainda|talvez|maybe|se|if|caso|or[cç]amento|quote|pensar|decidir|quanto cust|how much)\b/i;

export class DeterministicSaleClassifier extends SaleClassifier {
  classify(input: {
    text: string;
    positive: string[];
    negative?: string[];
    currency: string;
    coverage: ConversationCoverage;
  }): SaleClassification {
    const signals = input.positive.filter((phrase) =>
      matchesTriggerPhrase(input.text, phrase),
    );
    const negative =
      NEGATIVE.test(input.text) ||
      (input.negative ?? []).some((s) => matchesTriggerPhrase(input.text, s));
    const saleLikely = signals.length > 0 && !negative;
    const confidence = saleLikely
      ? input.coverage === "COMPLETE"
        ? 0.85
        : input.coverage === "PARTIAL"
          ? 0.65
          : 0.55
      : 0;
    return {
      saleLikely,
      confidence,
      valueCents: extractRevenueCents(input.text),
      currency: input.currency,
      evidence: signals,
      reason: negative
        ? "Negação ou linguagem condicional: confirmação necessária."
        : "Sinais de venda na conversa; aguardando confirmação.",
    };
  }
}
