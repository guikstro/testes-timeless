import { Injectable } from "@nestjs/common";
import { MetaApiError } from "./meta-api-error";
import {
  MetaAd,
  MetaAdSet,
  MetaCampaign,
  MetaConversionEventPayload,
  MetaConversionsApiResponse,
  MetaErrorResponse,
  MetaInsight,
  MetaPagedResponse,
} from "./meta-graph-types";

const DEFAULT_BASE_URL = "https://graph.facebook.com/v21.0";

export interface InsightsRange {
  since: string; // "YYYY-MM-DD"
  until: string; // "YYYY-MM-DD"
}

/**
 * Thin, typed wrapper over the Graph API endpoints this product actually
 * needs. `baseUrl` is overridable via META_GRAPH_API_BASE_URL specifically
 * so it can be pointed at a local mock server in tests/dev — there are no
 * real Meta credentials in this environment, so the full HTTP contract
 * (pagination, error shapes) is validated against a test double that mimics
 * Meta's documented responses, not against the live API. See
 * docs/META_ADS.md for exactly what real credentials would be needed.
 */
@Injectable()
export class MetaGraphClient {
  private readonly baseUrl = process.env.META_GRAPH_API_BASE_URL ?? DEFAULT_BASE_URL;

  async getCampaigns(adAccountId: string, accessToken: string): Promise<MetaCampaign[]> {
    const url = this.buildUrl(`/${adAccountId}/campaigns`, accessToken, { fields: "id,name,status" });
    return this.fetchAllPages<MetaCampaign>(url);
  }

  async getAdSets(adAccountId: string, accessToken: string): Promise<MetaAdSet[]> {
    const url = this.buildUrl(`/${adAccountId}/adsets`, accessToken, { fields: "id,name,status,campaign_id" });
    return this.fetchAllPages<MetaAdSet>(url);
  }

  async getAds(adAccountId: string, accessToken: string): Promise<MetaAd[]> {
    const url = this.buildUrl(`/${adAccountId}/ads`, accessToken, { fields: "id,name,status,adset_id" });
    return this.fetchAllPages<MetaAd>(url);
  }

  async getInsights(adAccountId: string, accessToken: string, range: InsightsRange): Promise<MetaInsight[]> {
    const url = this.buildUrl(`/${adAccountId}/insights`, accessToken, {
      level: "campaign",
      fields: "campaign_id,spend",
      time_increment: "1",
      time_range: JSON.stringify({ since: range.since, until: range.until }),
    });
    return this.fetchAllPages<MetaInsight>(url);
  }

  /**
   * Sends one event to the Conversions API (`POST /{pixel_id}/events`) —
   * used for Lead/QualifiedLead/Purchase (Fase 7), never for ads reporting.
   * Same error envelope as the rest of the Graph API, so it reuses the same
   * `MetaApiError` parsing/classification (token expired, rate limited).
   */
  async sendConversionEvent(
    pixelId: string,
    accessToken: string,
    payload: MetaConversionEventPayload,
  ): Promise<MetaConversionsApiResponse> {
    const response = await fetch(`${this.baseUrl}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [payload], access_token: accessToken }),
    });
    const body = await response.json();
    this.throwIfError(response, body);
    return body as MetaConversionsApiResponse;
  }

  private buildUrl(path: string, accessToken: string, params: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }

  private async fetchAllPages<T>(firstUrl: string): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | undefined = firstUrl;

    while (nextUrl) {
      const response: Response = await fetch(nextUrl);
      const body = await response.json();
      this.throwIfError(response, body);

      const page = body as MetaPagedResponse<T>;
      results.push(...page.data);
      nextUrl = page.paging?.next;
    }

    return results;
  }

  private throwIfError(response: Response, body: unknown): void {
    if (response.ok) return;
    const errorBody = body as MetaErrorResponse;
    throw new MetaApiError(
      errorBody.error?.code,
      errorBody.error?.error_subcode,
      errorBody.error?.message ?? `Meta API request failed with status ${response.status}`,
      response.status,
    );
  }
}
