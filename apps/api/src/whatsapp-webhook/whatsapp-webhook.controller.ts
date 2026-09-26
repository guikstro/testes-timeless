import { Controller, Get, HttpCode, HttpStatus, Post, Query, RawBodyRequest, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

/**
 * Public, unauthenticated — Meta calls this directly (see main.ts's prefix
 * exclusion). Authenticity is enforced via HMAC signature (POST) and the
 * verify token (GET handshake), not a session.
 */
/*
  Sem teto de requisição: o tráfego aqui vem dos servidores da Meta, de poucos endereços e em rajada. Um limite por IP descartaria
  mensagem de cliente achando que é abuso, e a proteção correta aqui é outra,
  a conferência da assinatura.
*/
@SkipThrottle()
@Controller("whatsapp-webhook")
export class WhatsAppWebhookController {
  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  @Get()
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() res: Response,
  ): void {
    if (this.webhookService.verifyHandshake(mode, token)) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    res.status(HttpStatus.FORBIDDEN).send();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    if (!this.webhookService.verifySignature(rawBody, signature)) {
      // Still 200: Meta disables/retries aggressively on non-2xx responses,
      // and an invalid signature is not something retrying will fix.
      return { received: false };
    }

    await this.webhookService.enqueueEvents(req.body);
    return { received: true };
  }
}
