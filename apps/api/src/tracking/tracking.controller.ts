import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { TrackingService } from "./tracking.service";

/**
 * Public redirect endpoint — no auth, mounted outside the `/api` prefix
 * (see main.ts) so links can be short: `<host>/r/<code>`. See docs/TRACKING.md.
 */
@Controller("r")
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get(":code")
  async redirect(
    @Param("code") code: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { destinationUrl } = await this.trackingService.recordClick(code, {
      query,
      referrer: req.headers.referer,
      userAgent: req.headers["user-agent"],
    });

    // 302 (temporary), not 301: the destination can change without stale
    // browser/CDN caches keeping people on an outdated redirect.
    res.redirect(302, destinationUrl);
  }
}
