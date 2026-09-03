import { Body, Controller, HttpCode, HttpStatus, Logger, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { RegistrarErroDto } from "./dto/registrar-erro.dto";

/**
 * Onde o erro que aconteceu no navegador vira registro.
 *
 * Sem isto, uma falha ao renderizar uma tela morre no console de quem viu:
 * o servidor responde 200, nada aparece no log, e o defeito só chega até nós
 * se a pessoa se der ao trabalho de contar. O que quebra para o cliente e
 * ninguém fica sabendo é o pior tipo de defeito.
 */
@Controller("telemetria")
export class TelemetriaController {
  private readonly logger = new Logger("Telemetria");

  /**
   * Sem sessão de propósito: a tela de login também pode quebrar, e ali não
   * há token. O teto por IP é o que impede isto virar canal de despejo.
   */
  @Post("erro")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 20, blockDuration: 300_000 } })
  registrar(@Body() dto: RegistrarErroDto, @Req() req: Request): void {
    this.logger.error(
      JSON.stringify({
        event: "erro_no_navegador",
        requestId: req.idDaRequisicao,
        caminho: dto.caminho,
        digest: dto.digest,
        mensagem: dto.mensagem,
        pilha: dto.pilha,
        // O agente ajuda a separar defeito real de extensão de navegador
        // quebrando a página, que é uma causa comum e não é nossa.
        agente: String(req.headers["user-agent"] ?? "").slice(0, 200),
      }),
    );
  }
}
