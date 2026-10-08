import {
  SaleConfirmationSource,
  SaleEvidenceType,
  SaleStatus,
} from "@prisma/client";

export interface Evidence {
  id: string;
  sourceId?: string | null;
  source: SaleConfirmationSource;
  type: SaleEvidenceType;
  status: SaleStatus;
  confidence: number | null;
  valueCents: number | null;
  currency: string;
  occurredAt: Date;
  payload?: unknown;
}

export const DEFAULT_AUTHORITY: Record<SaleConfirmationSource, number> = {
  PAYMENT: 50,
  ERP: 50,
  ECOMMERCE: 50,
  CRM: 40,
  API: 35,
  MANUAL: 30,
  CONVERSATION: 10,
};

export interface Conflict {
  type: "VALUE" | "CURRENCY" | "STATUS";
  evidenceId: string;
  source: SaleConfirmationSource;
  valueCents: number | null;
  currency: string;
  status: SaleStatus;
}

/** Pure, provider-independent policy. Outcomes can be reproduced from their evidence. */
export function resolveSale(
  evidence: Evidence[],
  authority = DEFAULT_AUTHORITY,
) {
  if (!evidence.length) throw new Error("A sale needs evidence");
  // A review acknowledges only evidence that existed when the reviewer acted.
  const review = [...evidence].reverse().find((e) => {
    const p = e.payload as {
      reviewedEvidenceIds?: string[];
      selectedEvidenceId?: string;
    } | null;
    return (
      e.source === "MANUAL" && p?.selectedEvidenceId && p.reviewedEvidenceIds
    );
  });
  const reviewed = review?.payload as
    | { reviewedEvidenceIds: string[]; selectedEvidenceId: string }
    | undefined;
  const considered = evidence.filter(
    (e) =>
      !reviewed ||
      !reviewed.reviewedEvidenceIds.includes(e.id) ||
      e.id === reviewed.selectedEvidenceId,
  );
  const latest = new Map<string, Evidence>();
  for (const item of considered) {
    if (item === review) continue;
    const key = item.sourceId ?? item.source;
    const previous = latest.get(key);
    // Manual actions arrive in audit order; a sale's business date can be
    // earlier or later than the time at which a reviewer corrects it.
    if (
      !previous ||
      item.source === "MANUAL" ||
      item.occurredAt >= previous.occurredAt
    )
      latest.set(key, item);
  }
  const ranked = [...latest.values()].sort(
    (a, b) =>
      authority[b.source] - authority[a.source] ||
      b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  const winner = ranked[0];
  if (!winner) throw new Error("No evidence selected");
  const saleDate =
    winner.source === "MANUAL"
      ? (winner.payload as { saleOccurredAt?: string } | null)?.saleOccurredAt
      : undefined;
  // Conversa sozinha não confirma receita, a não ser que o cliente tenha
  // escolhido isso (Configurações, Operação): aí a evidência vem marcada.
  const confirmadaPelaPolitica = Boolean(
    (winner.payload as { autoConfirmed?: boolean } | null)?.autoConfirmed,
  );
  const status =
    winner.source === "CONVERSATION" &&
    winner.type !== "LEGACY_IMPORT" &&
    !confirmadaPelaPolitica &&
    winner.status === "CONFIRMED"
      ? "PROBABLE"
      : winner.status;
  const conflicts: Conflict[] = [];
  for (const item of ranked.slice(1)) {
    if (item.source === "CONVERSATION" || winner.source === "CONVERSATION")
      continue;
    const type =
      item.status !== winner.status
        ? "STATUS"
        : item.currency !== winner.currency
          ? "CURRENCY"
          : item.valueCents !== null &&
              winner.valueCents !== null &&
              item.valueCents !== winner.valueCents
            ? "VALUE"
            : null;
    if (type)
      conflicts.push({
        type,
        evidenceId: item.id,
        source: item.source,
        valueCents: item.valueCents,
        currency: item.currency,
        status: item.status,
      });
  }
  return {
    status: status as SaleStatus,
    confidence: winner.confidence,
    amountCents: winner.valueCents,
    currency: winner.currency,
    confirmationSource: winner.source,
    occurredAt: saleDate ? new Date(saleDate) : winner.occurredAt,
    winnerId: winner.id,
    conflicts,
    needsReview:
      conflicts.length > 0 || status === "POSSIBLE" || status === "PROBABLE",
  };
}
