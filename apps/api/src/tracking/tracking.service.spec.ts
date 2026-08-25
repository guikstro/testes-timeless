import { TrackingService } from "./tracking.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";

describe("TrackingService", () => {
  function buildService() {
    const prisma = {
      trackingLink: { findFirst: jest.fn() },
      trackingClick: { create: jest.fn() },
    };
    const service = new TrackingService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it("throws for an unknown or soft-deleted link code", async () => {
    const { service, prisma } = buildService();
    prisma.trackingLink.findFirst.mockResolvedValue(null);

    await expect(service.recordClick("does-not-exist", { query: {} })).rejects.toThrow(AppException);
  });

  it("captures UTMs and media click ids from the query string", async () => {
    const { service, prisma } = buildService();
    prisma.trackingLink.findFirst.mockResolvedValue({
      id: "link-1",
      organizationId: "org-1",
      destinationUrl: "https://example.com/landing",
      defaultSource: null,
      defaultMedium: null,
      defaultCampaign: null,
    });

    const result = await service.recordClick("abc1234", {
      query: {
        utm_source: "instagram",
        utm_medium: "bio",
        utm_campaign: "direito-trabalhista",
        fbclid: "fb.123",
        campaign_id: "camp-1",
        adset_id: "adset-1",
        ad_id: "ad-1",
      },
      referrer: "https://instagram.com",
      userAgent: "Mozilla/5.0",
    });

    expect(result.destinationUrl).toBe("https://example.com/landing");
    expect(prisma.trackingClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trackingLinkId: "link-1",
        organizationId: "org-1",
        landingUrl: "https://example.com/landing",
        referrer: "https://instagram.com",
        userAgent: "Mozilla/5.0",
        utmSource: "instagram",
        utmMedium: "bio",
        utmCampaign: "direito-trabalhista",
        fbclid: "fb.123",
        campaignId: "camp-1",
        adsetId: "adset-1",
        adId: "ad-1",
        attributionToken: undefined,
      }),
    });
  });

  it("falls back to the link's default source/medium/campaign when the click has none", async () => {
    const { service, prisma } = buildService();
    prisma.trackingLink.findFirst.mockResolvedValue({
      id: "link-1",
      organizationId: "org-1",
      destinationUrl: "https://example.com/landing",
      defaultSource: "instagram",
      defaultMedium: "bio-link",
      defaultCampaign: "always-on",
    });

    await service.recordClick("abc1234", { query: {} });

    expect(prisma.trackingClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        utmSource: "instagram",
        utmMedium: "bio-link",
        utmCampaign: "always-on",
      }),
    });
  });

  it("prefers explicit UTMs on the click over the link's defaults", async () => {
    const { service, prisma } = buildService();
    prisma.trackingLink.findFirst.mockResolvedValue({
      id: "link-1",
      organizationId: "org-1",
      destinationUrl: "https://example.com/landing",
      defaultSource: "instagram",
      defaultMedium: "bio-link",
      defaultCampaign: "always-on",
    });

    await service.recordClick("abc1234", { query: { utm_source: "facebook_ads", utm_campaign: "black-friday" } });

    expect(prisma.trackingClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        utmSource: "facebook_ads",
        utmMedium: "bio-link",
        utmCampaign: "black-friday",
      }),
    });
  });

  it("never breaks on unexpected query shapes (e.g. a repeated param becoming an array)", async () => {
    const { service, prisma } = buildService();
    prisma.trackingLink.findFirst.mockResolvedValue({
      id: "link-1",
      organizationId: "org-1",
      destinationUrl: "https://example.com/landing",
      defaultSource: null,
      defaultMedium: null,
      defaultCampaign: null,
    });

    await expect(
      service.recordClick("abc1234", { query: { utm_source: ["first", "second"] } }),
    ).resolves.toBeDefined();

    expect(prisma.trackingClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ utmSource: "first" }),
    });
  });

  describe("WhatsApp destinations (Fase 4 attribution token)", () => {
    it("embeds a reference token into the redirect for a wa.me destination and persists it on the click", async () => {
      const { service, prisma } = buildService();
      prisma.trackingLink.findFirst.mockResolvedValue({
        id: "link-1",
        organizationId: "org-1",
        destinationUrl: "https://wa.me/5585999999999",
        defaultSource: null,
        defaultMedium: null,
        defaultCampaign: null,
      });

      const result = await service.recordClick("abc1234", { query: {} });

      expect(result.destinationUrl).toMatch(/^https:\/\/wa\.me\/5585999999999\?text=/);
      expect(result.destinationUrl).toContain(encodeURIComponent("[ref:"));

      const createCall = prisma.trackingClick.create.mock.calls[0][0];
      expect(createCall.data.landingUrl).toBe(result.destinationUrl);
      expect(createCall.data.attributionToken).toEqual(expect.any(String));
      expect(result.destinationUrl).toContain(encodeURIComponent(`[ref:${createCall.data.attributionToken}]`));
    });

    it("never stores an attribution token for a non-WhatsApp destination", async () => {
      const { service, prisma } = buildService();
      prisma.trackingLink.findFirst.mockResolvedValue({
        id: "link-1",
        organizationId: "org-1",
        destinationUrl: "https://example.com/landing",
        defaultSource: null,
        defaultMedium: null,
        defaultCampaign: null,
      });

      await service.recordClick("abc1234", { query: {} });

      expect(prisma.trackingClick.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ attributionToken: undefined }),
      });
    });
  });
});
