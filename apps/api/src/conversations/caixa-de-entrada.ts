import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { ATRASO_SEGUNDOS, EstagioDoLead, FiltroDaCaixa } from "./conversation-list";

/**
 * Teto de conversas devolvidas.
 *
 * Continua existindo, mas agora ele corta DEPOIS do filtro, e essa ordem é a
 * correção inteira desta consulta. Antes a tela lia as duzentas conversas com
 * atividade mais recente e só então filtrava em memória. Para o filtro de quem
 * espera resposta isso era exatamente ao contrário do necessário: quem espera
 * há mais tempo tem, por definição, a atividade mais antiga, então os leads
 * mais abandonados eram os primeiros a cair de fora da janela.
 *
 * Medido na base de demonstração, com trezentas e dezessete conversas: oitenta
 * esperavam resposta de verdade, a tela mostrava quarenta e quatro, e as
 * trinta e seis escondidas incluíam gente parada há noventa e sete dias.
 */
export const TETO_DE_CONVERSAS = 200;

/** Uma linha da caixa, já com a pendência calculada pelo banco. */
export interface LinhaDaCaixa {
  id: string;
  lastMessageAt: Date;
  leadId: string;
  leadName: string | null;
  normalizedPhone: string;
  rawPhone: string;
  status: EstagioDoLead;
  disqualifiedAt: Date | null;
  /** Mensagens do lead depois da nossa última resposta. */
  naoRespondidas: number;
  /** Quando começou a espera atual. Null quando ninguém está esperando. */
  esperaDesde: Date | null;
  ultimaDirecao: "INBOUND" | "OUTBOUND" | null;
  ultimoTipo: "TEXT" | "OTHER" | null;
  ultimoTexto: string | null;
  ultimaEm: Date | null;
}

export interface OpcoesDaCaixa {
  status?: FiltroDaCaixa;
  search?: string;
  /** Referência de tempo, para o corte de atraso ser determinístico em teste. */
  agora?: Date;
}

/**
 * Busca por nome ou telefone.
 *
 * O telefone é comparado só pelos dígitos porque ninguém digita o número do
 * jeito que ele está guardado: quem procura escreve "(11) 99999-9999" ou
 * "11999999999", e o banco tem "+5511999999999".
 */
function filtroDaBusca(termo: string | undefined): Prisma.Sql {
  const limpo = termo?.trim();
  if (!limpo) return Prisma.empty;

  const digitos = limpo.replace(/\D/g, "");
  const porNome = Prisma.sql`l.name ILIKE ${"%" + limpo + "%"}`;

  // Poucos dígitos casariam com quase todo número. Abaixo de três, a busca
  // vale só pelo nome.
  if (digitos.length < 3) return Prisma.sql`AND (${porNome})`;

  return Prisma.sql`AND (${porNome} OR l.normalized_phone LIKE ${"%" + digitos + "%"} OR l.raw_phone LIKE ${"%" + digitos + "%"})`;
}

/*
  A caixa de entrada, montada no banco.

  Em SQL, e não em Prisma, por duas razões que andam juntas. A pendência é
  "as mensagens do lead depois da nossa última resposta", coisa que não se
  expressa num filtro do Prisma; e enquanto ela era calculada em memória, a
  tela precisava carregar cinquenta mensagens de cada uma das duzentas
  conversas para descobrir uma contagem e uma data. Dez mil linhas para
  responder duas perguntas por conversa.

  Notas sobre o texto abaixo, que não cabem dentro dele: a coluna
  organization_id fica na própria conversa e existe justamente para nenhuma
  consulta desta tela alcançar a caixa de outro cliente; e o desempate da
  última mensagem usa a ordem de gravação porque o horário vem do WhatsApp e
  repete entre mensagens próximas, igual à ficha do lead.
*/
export async function buscaCaixaDeEntrada(
  prisma: PrismaService,
  organizationId: string,
  opcoes: OpcoesDaCaixa = {},
): Promise<LinhaDaCaixa[]> {
  const agora = opcoes.agora ?? new Date();
  const filtro = opcoes.status ?? "all";
  const limiteDoAtraso = new Date(agora.getTime() - ATRASO_SEGUNDOS * 1000);

  const condicao =
    filtro === "unread"
      ? Prisma.sql`WHERE COALESCE(p.nao_respondidas, 0) > 0`
      : filtro === "awaiting"
        ? Prisma.sql`WHERE p.espera_desde IS NOT NULL AND p.espera_desde <= ${limiteDoAtraso}`
        : Prisma.empty;

  /*
    Quem espera há mais tempo vem primeiro no filtro de sem resposta.

    Nos outros a ordem é a atividade mais recente, que é como se lê uma caixa
    de entrada. Mas quando a pergunta é "quem eu deixei esperando", listar por
    atividade recente responde exatamente o contrário: põe no topo quem acabou
    de escrever e empurra para o fim quem foi esquecido.
  */
  const ordem =
    filtro === "awaiting"
      ? Prisma.sql`ORDER BY p.espera_desde ASC`
      : Prisma.sql`ORDER BY c.last_message_at DESC`;

  return prisma.$queryRaw<LinhaDaCaixa[]>(Prisma.sql`
    WITH conversa AS (
      SELECT c.id,
             c.last_message_at,
             l.id   AS lead_id,
             l.name AS lead_name,
             l.normalized_phone,
             l.raw_phone,
             l.status,
             l.disqualified_at
      FROM conversations c
      JOIN leads l ON l.id = c.lead_id
      WHERE c.organization_id = ${organizationId}
      ${filtroDaBusca(opcoes.search)}
    ),
    saida AS (
      SELECT m.conversation_id, MAX(m.timestamp) AS em
      FROM messages m
      JOIN conversa c ON c.id = m.conversation_id
      WHERE m.direction = 'OUTBOUND'
      GROUP BY m.conversation_id
    ),
    pendencia AS (
      SELECT m.conversation_id,
             COUNT(*)::int    AS nao_respondidas,
             MIN(m.timestamp) AS espera_desde
      FROM messages m
      JOIN conversa c ON c.id = m.conversation_id
      LEFT JOIN saida s ON s.conversation_id = m.conversation_id
      WHERE m.direction = 'INBOUND'
        AND (s.em IS NULL OR m.timestamp > s.em)
      GROUP BY m.conversation_id
    ),
    ultima AS (
      SELECT DISTINCT ON (m.conversation_id)
             m.conversation_id, m.direction, m.type, m.text, m.timestamp
      FROM messages m
      JOIN conversa c ON c.id = m.conversation_id
      ORDER BY m.conversation_id, m.timestamp DESC, m.created_at DESC
    )
    SELECT c.id,
           c.last_message_at              AS "lastMessageAt",
           c.lead_id                      AS "leadId",
           c.lead_name                    AS "leadName",
           c.normalized_phone             AS "normalizedPhone",
           c.raw_phone                    AS "rawPhone",
           c.status::text                 AS "status",
           c.disqualified_at              AS "disqualifiedAt",
           COALESCE(p.nao_respondidas, 0) AS "naoRespondidas",
           p.espera_desde                 AS "esperaDesde",
           u.direction::text              AS "ultimaDirecao",
           u.type::text                   AS "ultimoTipo",
           u.text                         AS "ultimoTexto",
           u.timestamp                    AS "ultimaEm"
    FROM conversa c
    LEFT JOIN pendencia p ON p.conversation_id = c.id
    LEFT JOIN ultima u    ON u.conversation_id = c.id
    ${condicao}
    ${ordem}
    LIMIT ${TETO_DE_CONVERSAS}
  `);
}
