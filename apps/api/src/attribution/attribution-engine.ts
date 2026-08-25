import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { extractAttributionToken } from "../common/utils/extract-attribution-token";

export interface MessageReferral {
  ctwaClid?: string;
  sourceId?: string;
  sourceUrl?: string;
  headline?: string;
}

export interface ResolveAttributionInput {
  organizationId: string;
  messageText?: string;
  referral?: MessageReferral;
}

export interface AttributionResult {
  method: "CTWA_REFERRAL" | "TRACKING_LINK" | "UNKNOWN";
  confidence: "HIGH" | "NONE";
  trackingClickId: string | null;
  evidence: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

/**
 * Resolves first-touch attribution for a lead's very first message.
 * Precedence (Section 30, validated against what each identifier actually
 * proves rather than copied blindly from the spec's example):
 *
 *   1. Meta's own `referral.ctwa_clid` — given directly by Meta on a real
 *      Click-to-WhatsApp ad message, no correlation needed, strongest
 *      possible evidence.
 *   2. Our own reference token embedded in a wa.me redirect's prefilled
 *      text (see build-whatsapp-redirect-url.ts), matched back to the
 *      TrackingClick that generated it.
 *   3. UNKNOWN — never guess a campaign from weaker signals like a bare
 *      referrer or a UTM with no click to confirm it (Section 106).
 */
@Injectable()
export class AttributionEngine {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: ResolveAttributionInput): Promise<AttributionResult> {
    if (input.referral?.ctwaClid) {
      return {
        method: "CTWA_REFERRAL",
        confidence: "HIGH",
        trackingClickId: null,
        evidence: {
          ctwaClid: input.referral.ctwaClid,
          adId: input.referral.sourceId ?? null,
          sourceUrl: input.referral.sourceUrl ?? null,
          headline: input.referral.headline ?? null,
        },
      };
    }

    const token = extractAttributionToken(input.messageText);
    if (token) {
      const click = await this.prisma.trackingClick.findUnique({ where: { attributionToken: token } });
      if (click && click.organizationId === input.organizationId) {
        return {
          method: "TRACKING_LINK",
          confidence: "HIGH",
          trackingClickId: click.id,
          evidence: {
            trackingLinkId: click.trackingLinkId,
            utmSource: click.utmSource,
            utmMedium: click.utmMedium,
            utmCampaign: click.utmCampaign,
            campaignId: click.campaignId,
            adsetId: click.adsetId,
            adId: click.adId,
          },
        };
      }
    }

    return { method: "UNKNOWN", confidence: "NONE", trackingClickId: null, evidence: Prisma.JsonNull };
  }
}
