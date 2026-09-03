import { Controller, Get, Logger, Param, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { TrackingService } from "./tracking.service";
import { RedisThrottlerStorage } from "../common/throttling/redis-throttler.storage";
import { CLIQUES_CONTADOS, REDIRECIONAMENTO } from "../common/throttling/limites";

/**
 * Public redirect endpoint — no auth, mounted outside the `/api` prefix
 * (see main.ts) so links can be short: `<host>/r/<code>`. See docs/TRACKING.md.
 *
 * Dois tetos, com consequências diferentes de propósito:
 *
 * - O do decorador recusa com 429 e existe só para a busca do link no banco
 *   não virar vetor de sobrecarga. É alto: quem passa dali não está clicando
 *   em anúncio.
 * - O de baixo não recusa nada. Ele decide se o clique ainda entra na conta.
 *   O dano de um endereço público sem limite não é carga, é número inventado:
 *   encher a tabela de cliques falsos faz o custo por lead do cliente
 *   despencar no relatório, e não há como separar depois o que era real.
 */
@Throttle({ default: REDIRECIONAMENTO })
@Controller("r")
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor(
    private readonly trackingService: TrackingService,
    private readonly cota: RedisThrottlerStorage,
  ) {}

  @Get(":code")
  async redirect(
    @Param("code") code: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const registrar = await this.podeContar(req);

    const { destinationUrl } = await this.trackingService.recordClick(
      code,
      {
        query,
        referrer: req.headers.referer,
        userAgent: req.headers["user-agent"],
      },
      registrar,
    );

    // 302 (temporary), not 301: the destination can change without stale
    // browser/CDN caches keeping people on an outdated redirect.
    res.redirect(302, destinationUrl);
  }

  private async podeContar(req: Request): Promise<boolean> {
    const ip = req.ip ?? "desconhecido";
    try {
      const resultado = await this.cota.increment(
        `ip:${ip}`,
        CLIQUES_CONTADOS.ttl,
        CLIQUES_CONTADOS.limit,
        CLIQUES_CONTADOS.blockDuration,
        "clique",
      );

      if (resultado.isBlocked) {
        // Registrado no log porque um cliente perguntando "por que meus
        // cliques pararam de subir" precisa ter resposta.
        this.logger.warn(JSON.stringify({ event: "clique_nao_contado", motivo: "teto_por_ip", code: req.params.code }));
        return false;
      }
      return true;
    } catch (erro) {
      // Redis fora do ar não pode derrubar o redirecionamento: na dúvida,
      // conta. Perder o limite por alguns minutos é melhor que mandar quem
      // clicou no anúncio para uma página de erro.
      this.logger.error(JSON.stringify({ event: "cota_de_clique_indisponivel", error: String(erro) }));
      return true;
    }
  }
}
