import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { generateTrackingCode } from "../common/utils/generate-code";
import { buildWhatsAppRedirectUrl } from "../common/utils/build-whatsapp-redirect-url";
import { ClickQuery } from "./click-query.dto";

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstValue(value[0]);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface RecordClickContext {
  query: Record<string, unknown>;
  referrer?: string;
  userAgent?: string;
}

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists the click and returns where to redirect. Never throws for bad/
   * missing evidence in the query string — only an unknown link code is an
   * error here, since every other field is optional by nature (section 10).
   */
  async recordClick(
    code: string,
    context: RecordClickContext,
    /**
     * Falso quando o IP passou do teto de cliques por minuto.
     *
     * Deixa de contar sem deixar de redirecionar. O dano de um endereço
     * público sem limite não é carga, é número inventado: quem enche a tabela
     * de cliques falsos faz o custo por lead do cliente despencar no
     * relatório. Já devolver 429 quebraria a jornada de quem clicou no
     * anúncio de verdade, que é justamente quem precisa chegar ao WhatsApp.
     */
    registrar = true,
  ): Promise<{ destinationUrl: string }> {
    const link = await this.prisma.trackingLink.findFirst({
      where: { code, deletedAt: null },
    });

    if (!link) {
      throw new AppException("LINK_NOT_FOUND", "Link não encontrado.", HttpStatus.NOT_FOUND);
    }

    const q = context.query as ClickQuery;

    // Only actually used when the destination is a wa.me/api.whatsapp.com
    // link (buildWhatsAppRedirectUrl no-ops otherwise) — comparing before/
    // after tells us whether it was actually embedded, so we don't persist
    // a token that will never be looked up (Fase 4 — docs/ATTRIBUTION.md).
    const attributionToken = generateTrackingCode();
    const redirectUrl = buildWhatsAppRedirectUrl(link.destinationUrl, attributionToken);
    const tokenWasEmbedded = redirectUrl !== link.destinationUrl;

    if (!registrar) {
      return { destinationUrl: redirectUrl };
    }

    await this.prisma.trackingClick.create({
      data: {
        trackingLinkId: link.id,
        organizationId: link.organizationId,
        landingUrl: redirectUrl,
        referrer: context.referrer,
        userAgent: context.userAgent,
        utmSource: firstValue(q.utm_source) ?? link.defaultSource ?? undefined,
        utmMedium: firstValue(q.utm_medium) ?? link.defaultMedium ?? undefined,
        utmCampaign: firstValue(q.utm_campaign) ?? link.defaultCampaign ?? undefined,
        utmContent: firstValue(q.utm_content),
        utmTerm: firstValue(q.utm_term),
        fbclid: firstValue(q.fbclid),
        ctwaClid: firstValue(q.ctwa_clid),
        gclid: firstValue(q.gclid),
        campaignId: firstValue(q.campaign_id),
        adsetId: firstValue(q.adset_id),
        adId: firstValue(q.ad_id),
        attributionToken: tokenWasEmbedded ? attributionToken : undefined,
      },
    });

    return { destinationUrl: redirectUrl };
  }
}
