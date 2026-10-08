/** Vendor adapters translate into this contract; provider payloads never drive sale policy. */
export interface NormalizedCrmDeal {
  externalId: string;
  eventId: string;
  status: "OPEN" | "WON" | "LOST";
  phone?: string;
  email?: string;
  customerExternalId?: string;
  valueCents?: number;
  currency: string;
  occurredAt: Date;
  pipeline?: string;
  stage?: string;
  ownerExternalId?: string;
  ownerName?: string;
  lossReason?: string;
}

export interface CrmProvider {
  readonly provider: string;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    secret: string,
  ): boolean;
  normalize(payload: unknown): NormalizedCrmDeal[];
  sync(
    cursor?: string,
  ): Promise<{ deals: NormalizedCrmDeal[]; cursor?: string }>;
  health(): Promise<{ connected: boolean; lastError?: string }>;
}

export type PaymentState =
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "CHARGEBACK";
