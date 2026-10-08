import { Evidence, resolveSale } from "./sale-resolution";
import { DeterministicSaleClassifier } from "./sale-classifier";

const evidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  id: "one",
  type: "CRM_WON",
  source: "CRM",
  status: "CONFIRMED",
  confidence: 1,
  valueCents: 150000,
  currency: "BRL",
  occurredAt: new Date("2026-10-07T12:00:00Z"),
  ...overrides,
});
describe("Sale Resolution Engine", () => {
  it("applies manual correction in audit order and retains the sale business date", () => {
    const saleDate = new Date("2026-10-10T10:00:00Z");
    const result = resolveSale([
      evidence({
        source: "MANUAL",
        type: "MANUAL_CONFIRMATION",
        occurredAt: saleDate,
        valueCents: 85000,
      }),
      evidence({
        id: "review",
        source: "MANUAL",
        type: "MANUAL_CONFIRMATION",
        occurredAt: new Date("2026-10-08T12:00:00Z"),
        valueCents: 90000,
        payload: { saleOccurredAt: saleDate.toISOString() },
      }),
    ]);
    expect(result).toMatchObject({
      amountCents: 90000,
      occurredAt: saleDate,
      needsReview: false,
    });
  });
  it("conversation confidence never authorizes revenue", () => {
    expect(
      resolveSale([
        evidence({
          source: "CONVERSATION",
          type: "SALE_INTENT",
          confidence: 0.99,
        }),
      ]),
    ).toMatchObject({ status: "PROBABLE", needsReview: true });
  });
  it("keeps the payment value and exposes a conflicting CRM amount", () => {
    const result = resolveSale([
      evidence(),
      evidence({ id: "payment", source: "PAYMENT", valueCents: 120000 }),
    ]);
    expect(result).toMatchObject({
      amountCents: 120000,
      confirmationSource: "PAYMENT",
      needsReview: true,
    });
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        type: "VALUE",
        evidenceId: "one",
        valueCents: 150000,
      }),
    ]);
  });
  it("a weaker conversation never overwrites a confirmed payment", () => {
    const result = resolveSale([
      evidence({ source: "PAYMENT" }),
      evidence({
        source: "CONVERSATION",
        valueCents: 10,
        occurredAt: new Date("2026-10-08"),
        status: "POSSIBLE",
      }),
    ]);
    expect(result).toMatchObject({
      amountCents: 150000,
      status: "CONFIRMED",
      needsReview: false,
    });
  });
  it("refund supersedes its own payment while preserving both pieces of evidence", () => {
    expect(
      resolveSale([
        evidence({ source: "PAYMENT" }),
        evidence({
          source: "PAYMENT",
          id: "refund",
          status: "CANCELLED",
          type: "PAYMENT_REFUNDED",
          occurredAt: new Date("2026-10-08"),
        }),
      ]),
    ).toMatchObject({ status: "CANCELLED", needsReview: false });
  });
  it("late old events do not undo a refund", () => {
    expect(
      resolveSale([
        evidence({
          source: "PAYMENT",
          status: "CANCELLED",
          occurredAt: new Date("2026-10-08"),
        }),
        evidence({ source: "PAYMENT" }),
      ]).status,
    ).toBe("CANCELLED");
  });
  it("different credentials of the same source type do not hide conflicts", () => {
    expect(
      resolveSale([
        evidence({ sourceId: "crm-a" }),
        evidence({ sourceId: "crm-b", valueCents: 120000 }),
      ]).needsReview,
    ).toBe(true);
  });
  it("currency differences are explicit and never converted implicitly", () => {
    expect(
      resolveSale([
        evidence(),
        evidence({ source: "PAYMENT", currency: "USD" }),
      ]).conflicts[0].type,
    ).toBe("CURRENCY");
  });
  it("review acknowledges known evidence but a new conflict reopens it", () => {
    const crm = evidence();
    const payment = evidence({
      id: "payment",
      source: "PAYMENT",
      valueCents: 120000,
    });
    const review = evidence({
      id: "review",
      source: "MANUAL",
      payload: {
        reviewedEvidenceIds: ["one", "payment"],
        selectedEvidenceId: "payment",
      },
    });
    expect(resolveSale([crm, payment, review])).toMatchObject({
      needsReview: false,
      amountCents: 120000,
    });
    expect(
      resolveSale([
        crm,
        payment,
        review,
        evidence({
          id: "new-crm",
          valueCents: 180000,
          occurredAt: new Date("2026-10-08"),
        }),
      ]).needsReview,
    ).toBe(true);
  });
  it("unknown value stays unknown", () => {
    expect(
      resolveSale([evidence({ valueCents: null })]).amountCents,
    ).toBeNull();
  });
  it("legacy imports preserve history without claiming new independent evidence", () => {
    expect(
      resolveSale([evidence({ type: "LEGACY_IMPORT", source: "CONVERSATION" })])
        .status,
    ).toBe("CONFIRMED");
  });
});

describe("deterministic sale signals", () => {
  const classifier = new DeterministicSaleClassifier();
  const input = {
    positive: ["fechado", "closed", "PIX recebido"],
    currency: "BRL",
    coverage: "COMPLETE" as const,
  };
  it.each([
    "não está fechado",
    "ainda não fechado",
    "se ficar fechado",
    "maybe closed",
    "we haven't closed",
    "if closed",
    "não consegui pagar, fechado",
    "vou pensar, fechado",
  ])("rejects negation/conditional context: %s", (text) => {
    expect(classifier.classify({ ...input, text }).saleLikely).toBe(false);
  });
  it("supports organization phrases, amounts and coverage penalties", () => {
    const complete = classifier.classify({
      ...input,
      text: "PIX recebido R$ 850,00",
    });
    const partial = classifier.classify({
      ...input,
      text: "PIX recebido R$ 850,00",
      coverage: "PARTIAL",
    });
    expect(complete).toMatchObject({ saleLikely: true, valueCents: 85000 });
    expect(partial.confidence).toBeLessThan(complete.confidence);
  });
  it("supports customer-specific negative phrases", () => {
    expect(
      classifier.classify({
        ...input,
        text: "fechado apenas para simulação",
        negative: ["simulação"],
      }).saleLikely,
    ).toBe(false);
  });
});
