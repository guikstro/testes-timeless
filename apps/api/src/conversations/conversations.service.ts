import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversaBruta, FiltroDaCaixa, montaLista } from "./conversation-list";

/**
 * Teto de conversas lidas de uma vez.
 *
 * Os filtros dependem de olhar as últimas mensagens de cada conversa, coisa
 * que não dá para expressar na consulta, então a filtragem acontece depois de
 * ler. O teto é o que impede uma organização com muita conversa antiga de
 * transformar a abertura da caixa numa varredura da tabela inteira.
 */
const TETO_DE_CONVERSAS = 200;

/**
 * Quantas mensagens recentes bastam para saber o que está pendente.
 *
 * A contagem para na primeira mensagem nossa, então só uma sequência de
 * cinquenta mensagens do lead sem nenhuma resposta esgotaria isto, e nesse
 * caso o número exato importa menos que o fato de estar abandonada.
 */
const MENSAGENS_POR_CONVERSA = 50;

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, opcoes: { status?: FiltroDaCaixa; search?: string } = {}) {
    const conversas = await this.prisma.conversation.findMany({
      // `organizationId` na própria conversa, e não só pelo lead: é a coluna
      // que existe justamente para nenhuma consulta desta tela poder alcançar
      // a caixa de outro cliente.
      where: { organizationId, ...this.busca(opcoes.search) },
      orderBy: { lastMessageAt: "desc" },
      take: TETO_DE_CONVERSAS,
      select: {
        id: true,
        lastMessageAt: true,
        lead: {
          select: {
            id: true,
            name: true,
            normalizedPhone: true,
            rawPhone: true,
            status: true,
            disqualifiedAt: true,
          },
        },
        messages: {
          orderBy: { timestamp: "desc" },
          take: MENSAGENS_POR_CONVERSA,
          select: { direction: true, type: true, text: true, timestamp: true },
        },
      },
    });

    const conversations = montaLista(conversas as unknown as ConversaBruta[], new Date(), opcoes.status ?? "all");

    return {
      conversations,
      total: conversations.length,
      // A tela precisa saber que a lista foi cortada, ou "não encontrei" e
      // "não procurei além daqui" viram a mesma frase para quem lê.
      truncado: conversas.length === TETO_DE_CONVERSAS,
    };
  }

  /**
   * Busca por nome ou telefone.
   *
   * O telefone é comparado só pelos dígitos porque ninguém digita o número do
   * jeito que ele está guardado: quem procura escreve "(11) 99999-9999" ou
   * "11999999999", e o banco tem "+5511999999999".
   */
  private busca(termo: string | undefined): Prisma.ConversationWhereInput {
    const limpo = termo?.trim();
    if (!limpo) return {};

    const digitos = limpo.replace(/\D/g, "");
    const condicoes: Prisma.LeadWhereInput[] = [
      { name: { contains: limpo, mode: "insensitive" } },
    ];
    if (digitos.length >= 3) {
      condicoes.push({ normalizedPhone: { contains: digitos } }, { rawPhone: { contains: digitos } });
    }

    return { lead: { OR: condicoes } };
  }
}
