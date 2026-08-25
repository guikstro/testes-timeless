/** The subset of Meta's documented response shapes this client actually reads. */

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  adset_id: string;
}

export interface MetaInsight {
  campaign_id: string;
  spend: string; // Meta returns this as a decimal string, e.g. "123.45"
  date_start: string; // "YYYY-MM-DD"
}

export interface MetaPagedResponse<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export interface MetaErrorResponse {
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Body for a single event sent to `POST /{pixel_id}/events` (Conversions
 * API). `action_source`/`messaging_channel` are fixed to the click-to-
 * WhatsApp lead-gen shape this product actually produces — see
 * docs/META_CAPI.md for why, and why `ctwa_clid` is the only optional match
 * key (no browser fbc/fbp: there is no website Pixel in this flow).
 */
export interface MetaConversionEventPayload {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "business_messaging";
  messaging_channel: "whatsapp";
  user_data: {
    ph: string[];
    ctwa_clid?: string;
  };
  custom_data?: {
    value: number;
    currency: string;
  };
}

export interface MetaConversionsApiResponse {
  events_received: number;
  fbtrace_id: string;
}
