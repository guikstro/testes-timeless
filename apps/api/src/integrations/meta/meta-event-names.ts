import { ConversionEventType } from "@prisma/client";

/**
 * "Lead" and "Purchase" are Meta standard events. "QualifiedLead" is a
 * deliberate custom event — Meta's standard event list has no mid-funnel
 * equivalent, and forcing this into an unrelated standard name would be
 * exactly the kind of invented/incompatible mapping this product avoids
 * (see docs/META_CAPI.md). Custom event names are still accepted by the
 * Conversions API and show up in Events Manager, just without standard-event
 * optimization features.
 */
export const META_EVENT_NAME_BY_TYPE: Record<ConversionEventType, string> = {
  LEAD: "Lead",
  QUALIFIED_LEAD: "QualifiedLead",
  PURCHASE: "Purchase",
};
