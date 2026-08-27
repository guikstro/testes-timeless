import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, RawBodyRequest, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

/**
 * Public, unauthenticated — Meta calls this directly (see main.ts's prefix
 * exclusion). Authenticity is enforced via HMAC signature (POST) and the
 * verify token (GET handshake), not a session.
 */
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

  /**
   * Contraparte da Evolution API (Fase 8). Diferente da Meta, a Evolution não
   * assina o corpo com HMAC — então a autenticidade vem de um segredo
   * compartilhado no path, registrado por nós ao criar a instância. Sem isso,
   * qualquer um que alcançasse esta porta poderia injetar mensagens e
   * fabricar leads/vendas.
   */
  @Post("evolution/:token")
  @HttpCode(HttpStatus.OK)
  async receiveEvolution(
    @Param("token") token: string,
    @Body() body: unknown,
  ): Promise<{ received: boolean }> {
    if (!this.webhookService.verifyEvolutionToken(token)) {
      // Mesma razão do 200 acima: a Evolution reentrega em não-2xx, e um
      // token errado não vai ficar certo numa segunda tentativa.
      return { received: false };
    }

    await this.webhookService.enqueueEvolutionEvent(body);
    return { received: true };
  }
}
