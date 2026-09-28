import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { assinaturaDoErro } from "./assinatura";

export interface ErroParaRegistrar {
  origem: "api" | "navegador";
  tipo: string;
  mensagem: string;
  detalhe?: string;
  /** O que agrupa além da mensagem: a rota, a tela ou o quadro da pilha. */
  lugar?: string | null;
  contexto?: Record<string, unknown>;
}

/** Um aviso por erro a cada 15 minutos, no máximo: uma falha em laço não pode virar spam. */
const INTERVALO_ENTRE_AVISOS_MS = 15 * 60 * 1000;
const TAMANHO_MAXIMO_DO_DETALHE = 4_000;

/**
 * Onde o erro da plataforma vira registro, agrupado, e aviso para a equipe.
 *
 * Tudo aqui é à prova de falha: registrar um erro nunca pode produzir outro
 * para quem estava sendo atendido. Se o banco estiver fora, sobra o log.
 *
 * O filtro de exceções e o tratador de rejeições do processo não passam pela
 * injeção de dependência (são criados com `new` e no `main`), por isso há a
 * instância estática em `anota`.
 */
@Injectable()
export class RegistroDeErros implements OnModuleInit, OnModuleDestroy {
  private static instancia: RegistroDeErros | null = null;
  private readonly logger = new Logger("RegistroDeErros");
  private readonly ultimoAviso = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    RegistroDeErros.instancia = this;
  }

  onModuleDestroy(): void {
    if (RegistroDeErros.instancia === this) RegistroDeErros.instancia = null;
  }

  /** Para quem não tem injeção. Não espera nem falha. */
  static anota(erro: ErroParaRegistrar): void {
    void RegistroDeErros.instancia?.registra(erro);
  }

  async registra(erro: ErroParaRegistrar): Promise<void> {
    try {
      const assinatura = assinaturaDoErro(erro);
      const agora = new Date();
      const dados = {
        mensagem: erro.mensagem.slice(0, 1_000),
        detalhe: erro.detalhe?.slice(0, TAMANHO_MAXIMO_DO_DETALHE) ?? null,
        contexto: (erro.contexto ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      };

      const antes = await this.prisma.erroDaPlataforma.findUnique({
        where: { assinatura },
        select: { resolvidoEm: true },
      });
      await this.prisma.erroDaPlataforma.upsert({
        where: { assinatura },
        create: { origem: erro.origem, tipo: erro.tipo, assinatura, ...dados },
        // Voltou depois de resolvido: reabre, porque a correção não pegou.
        update: { ...dados, ocorrencias: { increment: 1 }, ultimaEm: agora, resolvidoEm: null },
      });

      const novo = !antes;
      const voltou = Boolean(antes?.resolvidoEm);
      if (novo || voltou) await this.avisa(assinatura, erro, voltou);
    } catch (falha) {
      this.logger.error(
        JSON.stringify({ event: "registro_de_erro_falhou", tipo: erro.tipo, message: (falha as Error).message }),
      );
    }
  }

  /**
   * Avisa num webhook, se houver um configurado (`ALERTA_WEBHOOK_URL`). O
   * corpo tem `text` e `content`, que é o que Slack e Discord leem, para
   * funcionar com os dois sem configuração a mais.
   */
  private async avisa(assinatura: string, erro: ErroParaRegistrar, voltou: boolean): Promise<void> {
    const destino = process.env.ALERTA_WEBHOOK_URL?.trim();
    if (!destino) return;

    const agora = Date.now();
    if (agora - (this.ultimoAviso.get(assinatura) ?? 0) < INTERVALO_ENTRE_AVISOS_MS) return;
    this.ultimoAviso.set(assinatura, agora);

    const onde = erro.lugar ? ` em ${erro.lugar}` : "";
    const texto = `${voltou ? "Voltou a acontecer" : "Erro novo"} (${erro.origem})${onde}: ${erro.mensagem.slice(0, 300)}`;
    try {
      await fetch(destino, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto, content: texto }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (falha) {
      this.logger.warn(JSON.stringify({ event: "aviso_de_erro_falhou", message: (falha as Error).message }));
    }
  }

  async lista(incluirResolvidos: boolean) {
    return this.prisma.erroDaPlataforma.findMany({
      where: incluirResolvidos ? {} : { resolvidoEm: null },
      orderBy: { ultimaEm: "desc" },
      take: 50,
    });
  }

  async resolve(id: string): Promise<void> {
    await this.prisma.erroDaPlataforma.updateMany({ where: { id }, data: { resolvidoEm: new Date() } });
  }
}
