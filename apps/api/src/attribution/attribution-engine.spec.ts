import { Prisma } from "@prisma/client";
import { AttributionEngine } from "./attribution-engine";
import { PrismaService } from "../common/prisma/prisma.service";

describe("AttributionEngine", () => {
  function buildEngine() {
    const prisma = { trackingClick: { findUnique: jest.fn() } };
    const engine = new AttributionEngine(prisma as unknown as PrismaService);
    return { engine, prisma };
  }

  it("prioritizes Meta's own CTWA referral over everything else, even when a tracking token is also present", async () => {
    const { engine, prisma } = buildEngine();

    const result = await engine.resolve({
      organizationId: "org-1",
      messageText: "oi [ref:AB12CD]",
      referral: { ctwaClid: "ctwa-abc", sourceId: "ad-1", sourceUrl: "https://fb.me/x" },
    });

    expect(result.method).toBe("CTWA_REFERRAL");
    expect(result.confidence).toBe("HIGH");
    expect(result.trackingClickId).toBeNull();
    expect(result.evidence).toMatchObject({ ctwaClid: "ctwa-abc", adId: "ad-1" });
    expect(prisma.trackingClick.findUnique).not.toHaveBeenCalled();
  });

  it("attributes to the tracking link when the message carries a matching reference token", async () => {
    const { engine, prisma } = buildEngine();
    prisma.trackingClick.findUnique.mockResolvedValue({
      id: "click-1",
      organizationId: "org-1",
      trackingLinkId: "link-1",
      utmSource: "instagram",
      utmMedium: "bio",
      utmCampaign: "direito-trabalhista",
      campaignId: "camp-1",
      adsetId: "adset-1",
      adId: "ad-1",
    });

    const result = await engine.resolve({ organizationId: "org-1", messageText: "oi [ref:AB12CD]" });

    expect(result.method).toBe("TRACKING_LINK");
    expect(result.confidence).toBe("HIGH");
    expect(result.trackingClickId).toBe("click-1");
    expect(result.evidence).toMatchObject({ utmCampaign: "direito-trabalhista", campaignId: "camp-1" });
  });

  it("never attributes to a tracking click that belongs to a different organization", async () => {
    const { engine, prisma } = buildEngine();
    prisma.trackingClick.findUnique.mockResolvedValue({ id: "click-1", organizationId: "org-OTHER" });

    const result = await engine.resolve({ organizationId: "org-1", messageText: "oi [ref:AB12CD]" });

    expect(result.method).toBe("UNKNOWN");
    expect(result.trackingClickId).toBeNull();
  });

  it("returns UNKNOWN with no evidence when the message has no token and there's no referral — never guesses", async () => {
    const { engine, prisma } = buildEngine();

    const result = await engine.resolve({ organizationId: "org-1", messageText: "Fui demitido e não recebi tudo" });

    expect(result).toEqual({
      method: "UNKNOWN",
      confidence: "NONE",
      trackingClickId: null,
      evidence: Prisma.JsonNull,
    });
    expect(prisma.trackingClick.findUnique).not.toHaveBeenCalled();
  });

  it("returns UNKNOWN when the token doesn't match any known click", async () => {
    const { engine, prisma } = buildEngine();
    prisma.trackingClick.findUnique.mockResolvedValue(null);

    const result = await engine.resolve({ organizationId: "org-1", messageText: "oi [ref:NOTREAL]" });

    expect(result.method).toBe("UNKNOWN");
  });
});
