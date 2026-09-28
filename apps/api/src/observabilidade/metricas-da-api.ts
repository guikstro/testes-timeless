import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Pedidos, erros e tempo de resposta da API, minuto a minuto, na última hora.
 *
 * Na memória do processo, e não no banco nem no Redis: é a leitura de "como
 * está agora", recomeça a cada publicação, e medir não pode custar uma
 * escrita por pedido. A API roda num processo só; com mais de um, cada um
 * diria o seu.
 */
const MINUTOS_GUARDADOS = 60;
/** Amostras de duração por minuto. Acima disso, sorteia quem entra, e a mediana continua honesta. */
const AMOSTRAS_POR_MINUTO = 300;

interface Minuto {
  inicio: number;
  pedidos: number;
  erros: number;
  duracoes: number[];
}

export interface ResumoDasMetricas {
  desde: string;
  pedidos: number;
  erros: number;
  taxaDeErro: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  porMinuto: { minuto: string; pedidos: number; erros: number }[];
}

@Injectable()
export class MetricasDaApi {
  private readonly minutos = new Map<number, Minuto>();

  anota(duracaoMs: number, status: number, agora = Date.now()): void {
    const inicio = Math.floor(agora / 60_000) * 60_000;
    let minuto = this.minutos.get(inicio);
    if (!minuto) {
      minuto = { inicio, pedidos: 0, erros: 0, duracoes: [] };
      this.minutos.set(inicio, minuto);
      this.descartaAntigos(inicio);
    }
    minuto.pedidos += 1;
    if (status >= 500) minuto.erros += 1;
    if (minuto.duracoes.length < AMOSTRAS_POR_MINUTO) minuto.duracoes.push(duracaoMs);
    else {
      const posicao = Math.floor(Math.random() * minuto.pedidos);
      if (posicao < AMOSTRAS_POR_MINUTO) minuto.duracoes[posicao] = duracaoMs;
    }
  }

  resumo(agora = Date.now()): ResumoDasMetricas {
    const corte = agora - MINUTOS_GUARDADOS * 60_000;
    const lista = [...this.minutos.values()].filter((m) => m.inicio >= corte).sort((a, b) => a.inicio - b.inicio);
    const pedidos = lista.reduce((soma, m) => soma + m.pedidos, 0);
    const erros = lista.reduce((soma, m) => soma + m.erros, 0);
    const duracoes = lista.flatMap((m) => m.duracoes).sort((a, b) => a - b);
    const percentil = (p: number) =>
      duracoes.length ? Math.round(duracoes[Math.min(duracoes.length - 1, Math.floor((p / 100) * duracoes.length))]) : null;

    return {
      desde: new Date(corte).toISOString(),
      pedidos,
      erros,
      taxaDeErro: pedidos ? erros / pedidos : null,
      p50Ms: percentil(50),
      p95Ms: percentil(95),
      porMinuto: lista.map((m) => ({ minuto: new Date(m.inicio).toISOString(), pedidos: m.pedidos, erros: m.erros })),
    };
  }

  private descartaAntigos(agora: number): void {
    const corte = agora - MINUTOS_GUARDADOS * 60_000;
    for (const inicio of this.minutos.keys()) if (inicio < corte) this.minutos.delete(inicio);
  }
}

/**
 * Mede cada pedido quando a resposta termina. As rotas de saúde ficam de
 * fora: o monitoramento consulta o tempo todo e afogaria o que importa.
 */
@Injectable()
export class MedeOsPedidos implements NestMiddleware {
  constructor(private readonly metricas: MetricasDaApi) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.originalUrl.startsWith("/health")) return next();
    const inicio = process.hrtime.bigint();
    res.on("finish", () => {
      this.metricas.anota(Number(process.hrtime.bigint() - inicio) / 1e6, res.statusCode);
    });
    next();
  }
}
