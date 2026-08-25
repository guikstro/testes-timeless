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
