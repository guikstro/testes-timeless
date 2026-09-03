import { Prisma, MessageDirection } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * O que a tela precisa saber das mensagens de um lead, sem carregar nenhuma.
 *
 * O dashboard usava as mensagens para exatamente duas contas: quanto tempo a
 * equipe levou para responder, e se a bola está com ela agora. Para isso ele
 * trazia toda mensagem de toda conversa de todo lead da janela para dentro do
 * Node, o que fazia o custo da tela mais acessada do produto crescer com o
 * volume de conversa e não com o de lead. Na base atual são treze mensagens
 * por lead em média e mil trezentas e oitenta e sete no maior deles, então a
 * conta pesa treze vezes mais do que precisa e um único lead conversador
 * domina a tela inteira.
 *
 * Três datas por lead respondem as mesmas duas perguntas.
 */
export interface AtendimentoDoLead {
  /** A primeira mensagem que o lead mandou. */
  primeiroRecebido: Date | null;
  /** A primeira resposta que de fato chegou nele, já depois da mensagem dele. */
  primeiraResposta: Date | null;
  /** Sentido da última mensagem: INBOUND é a bola com a equipe. */
  ultimoSentido: MessageDirection | null;
}

interface Linha {
  leadId: string;
  primeiroRecebido: Date | null;
  primeiraResposta: Date | null;
  ultimoSentido: MessageDirection | null;
}

/**
 * Uma consulta só, agregando no banco.
 *
 * Em SQL, e não em `groupBy` do Prisma, porque a primeira resposta é
 * correlacionada: ela é a primeira saída **depois** da primeira entrada, e
 * isso não se expressa num agrupamento simples. Hoje toda conversa começa
 * pelo lead, então na prática as duas formas dariam o mesmo número, mas o
 * `timestamp` vem do relógio do WhatsApp e não do nosso, e não vale a pena
 * apostar numa ordem que não é garantida por nada.
 *
 * `FAILED` e `PENDING` não contam como resposta pelo mesmo motivo de sempre:
 * uma mensagem que não saiu não atendeu ninguém, e contá-la esconderia
 * justamente o caso em que o cliente ficou esperando. `null` conta, porque é
 * uma saída que não passou pela nossa fila (ver `reachedTheLead`).
 */
export async function atendimentoPorLead(
  prisma: PrismaService,
  leadIds: string[],
): Promise<Map<string, AtendimentoDoLead>> {
  const mapa = new Map<string, AtendimentoDoLead>();
  if (leadIds.length === 0) return mapa;

  const linhas = await prisma.$queryRaw<Linha[]>(Prisma.sql`
    WITH mensagens AS (
      SELECT c.lead_id, m.direction, m.timestamp, m.outbound_status, m.created_at
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.lead_id = ANY(${leadIds})
    ),
    entrada AS (
      SELECT lead_id, MIN(timestamp) AS primeiro_recebido
      FROM mensagens
      WHERE direction = 'INBOUND'
      GROUP BY lead_id
    ),
    resposta AS (
      SELECT m.lead_id, MIN(m.timestamp) AS primeira_resposta
      FROM mensagens m
      JOIN entrada e ON e.lead_id = m.lead_id
      WHERE m.direction = 'OUTBOUND'
        AND (m.outbound_status IS NULL OR m.outbound_status = 'SENT')
        AND m.timestamp >= e.primeiro_recebido
      GROUP BY m.lead_id
    ),
    ultima AS (
      -- Mesmo desempate da ficha do lead: o horário vem do WhatsApp e
      -- repete entre mensagens próximas, então a ordem de gravação decide.
      SELECT DISTINCT ON (lead_id) lead_id, direction
      FROM mensagens
      ORDER BY lead_id, timestamp DESC, created_at DESC
    )
    SELECT u.lead_id            AS "leadId",
           e.primeiro_recebido  AS "primeiroRecebido",
           r.primeira_resposta  AS "primeiraResposta",
           u.direction          AS "ultimoSentido"
    FROM ultima u
    LEFT JOIN entrada e  ON e.lead_id = u.lead_id
    LEFT JOIN resposta r ON r.lead_id = u.lead_id
  `);

  for (const linha of linhas) {
    mapa.set(linha.leadId, {
      primeiroRecebido: linha.primeiroRecebido,
      primeiraResposta: linha.primeiraResposta,
      ultimoSentido: linha.ultimoSentido,
    });
  }

  return mapa;
}
