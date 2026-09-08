import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { buscaCaixaDeEntrada, TETO_DE_CONVERSAS } from "./caixa-de-entrada";
import { FiltroDaCaixa, montaItem } from "./conversation-list";

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A caixa de entrada.
   *
   * O filtro e a ordem vêm do banco, e não de uma filtragem em memória depois
   * de ler: a versão anterior lia as duzentas conversas com atividade mais
   * recente e só então separava as que esperavam resposta, o que escondia
   * exatamente as mais abandonadas — elas têm, por definição, a atividade mais
   * antiga. Ver `caixa-de-entrada.ts`.
   */
  async list(
    organizationId: string,
    opcoes: { status?: FiltroDaCaixa; search?: string; agora?: Date } = {},
  ) {
    const agora = opcoes.agora ?? new Date();
    const linhas = await buscaCaixaDeEntrada(this.prisma, organizationId, { ...opcoes, agora });

    return {
      conversations: linhas.map((linha) => montaItem(linha, agora)),
      total: linhas.length,
      // A tela precisa saber que a lista foi cortada, ou "não encontrei" e
      // "não procurei além daqui" viram a mesma frase para quem lê. Agora o
      // corte é dentro do filtro pedido, que é o que a frase de fato promete.
      truncado: linhas.length === TETO_DE_CONVERSAS,
    };
  }
}
