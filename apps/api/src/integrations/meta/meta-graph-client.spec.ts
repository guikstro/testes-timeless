import { MetaGraphClient } from "./meta-graph-client";
import { MetaApiError } from "./meta-api-error";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("MetaGraphClient", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetches campaigns with the expected fields and access token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "c1", name: "Direito Trabalhista", status: "ACTIVE" }] }),
    );
    const client = new MetaGraphClient();

    const campaigns = await client.getCampaigns("act_123", "token-abc");

    expect(campaigns).toEqual([{ id: "c1", name: "Direito Trabalhista", status: "ACTIVE" }]);
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.pathname).toBe("/v21.0/act_123/campaigns");
    expect(requestedUrl.searchParams.get("fields")).toBe("id,name,status");
    expect(requestedUrl.searchParams.get("access_token")).toBe("token-abc");
  });

  it("follows paging.next until the last page, concatenating every page's data", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "c1", name: "Campanha 1", status: "ACTIVE" }],
          paging: { next: "https://graph.facebook.com/v21.0/act_123/campaigns?after=cursor1" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "c2", name: "Campanha 2", status: "PAUSED" }] }));
    const client = new MetaGraphClient();

    const campaigns = await client.getCampaigns("act_123", "token-abc");

    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://graph.facebook.com/v21.0/act_123/campaigns?after=cursor1");
  });

  it("throws a MetaApiError with the parsed code when Meta returns an error body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: "Error validating access token", type: "OAuthException", code: 190, error_subcode: 463 } },
        401,
      ),
    );
    const client = new MetaGraphClient();

    await expect(client.getCampaigns("act_123", "expired-token")).rejects.toThrow(MetaApiError);
    try {
      await client.getCampaigns("act_123", "expired-token");
      fail("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MetaApiError);
      expect((error as MetaApiError).code).toBe(190);
      expect((error as MetaApiError).isTokenExpired).toBe(true);
      expect((error as MetaApiError).isRateLimited).toBe(false);
    }
  });

  it("identifies a rate-limit error by HTTP 429 even without Meta's specific error code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "Too many calls" } }, 429));
    const client = new MetaGraphClient();

    try {
      await client.getCampaigns("act_123", "token-abc");
      fail("expected to throw");
    } catch (error) {
      expect((error as MetaApiError).isRateLimited).toBe(true);
      expect((error as MetaApiError).isTokenExpired).toBe(false);
    }
  });

  it("requests ad sets and ads with their respective linking fields", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "as1", name: "Conjunto 1", status: "ACTIVE", campaign_id: "c1" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "ad1", name: "Anúncio 1", status: "ACTIVE", adset_id: "as1" }] }));
    const client = new MetaGraphClient();

    const adSets = await client.getAdSets("act_123", "token-abc");
    const ads = await client.getAds("act_123", "token-abc");

    expect(adSets[0]).toMatchObject({ campaign_id: "c1" });
    expect(ads[0]).toMatchObject({ adset_id: "as1" });
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("fields")).toBe(
      "id,name,status,campaign_id",
    );
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("fields")).toBe("id,name,status,adset_id");
  });

  it("requests insights with a daily breakdown over the given date range", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ campaign_id: "c1", spend: "123.45", date_start: "2026-08-01" }] }),
    );
    const client = new MetaGraphClient();

    const insights = await client.getInsights("act_123", "token-abc", { since: "2026-08-01", until: "2026-08-07" });

    expect(insights).toEqual([{ campaign_id: "c1", spend: "123.45", date_start: "2026-08-01" }]);
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get("level")).toBe("campaign");
    expect(requestedUrl.searchParams.get("time_increment")).toBe("1");
    expect(JSON.parse(requestedUrl.searchParams.get("time_range")!)).toEqual({
      since: "2026-08-01",
      until: "2026-08-07",
    });
  });

  describe("sendConversionEvent (Fase 7)", () => {
    it("posts the event wrapped in a data array, with the access token in the body (not the URL)", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ events_received: 1, fbtrace_id: "trace-1" }));
      const client = new MetaGraphClient();
      const payload = {
        event_name: "Lead",
        event_time: 1700000000,
        event_id: "lead-1:LEAD",
        action_source: "business_messaging" as const,
        messaging_channel: "whatsapp" as const,
        user_data: { ph: ["hash1"] },
      };

      const result = await client.sendConversionEvent("1234567890", "capi-token", payload);

      expect(result).toEqual({ events_received: 1, fbtrace_id: "trace-1" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(new URL(url as string).pathname).toBe("/v21.0/1234567890/events");
      expect(new URL(url as string).searchParams.get("access_token")).toBeNull();
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({ data: [payload], access_token: "capi-token" });
    });

    it("throws a MetaApiError when Meta rejects the event", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: "Error validating access token", code: 190 } }, 401),
      );
      const client = new MetaGraphClient();

      await expect(
        client.sendConversionEvent("1234567890", "expired-token", {
          event_name: "Purchase",
          event_time: 1700000000,
          event_id: "lead-1:PURCHASE",
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          user_data: { ph: ["hash1"] },
          custom_data: { value: 100, currency: "BRL" },
        }),
      ).rejects.toThrow(MetaApiError);
    });
  });
});
