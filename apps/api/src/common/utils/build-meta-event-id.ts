import { ConversionEventType } from "@prisma/client";

/**
 * Deterministic `event_id` sent to Meta for every conversion event — derived
 * only from (leadId, type), never randomized. This is what lets a BullMQ
 * retry (or a defensive re-enqueue) never register a second event at Meta
 * for the same lead/type: same inputs always produce the same event_id.
 */
export function buildMetaEventId(leadId: string, type: ConversionEventType): string {
  return `${leadId}:${type}`;
}
