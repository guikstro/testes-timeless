import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * A barra de perguntas ("estilo ChatGPT") com RAG gratuito.
 *
 * 1. Recupera (R): busca de texto em português do próprio Postgres nas
 *    mensagens, nos leads e nos links, mais os números do período. Sem
 *    serviço pago e sem banco vetorial: o índice GIN da migration resolve.
 * 2. Gera (G), opcional: com GEMINI_API_KEY (camada grátis do Google AI
 *    Studio), o Gemini escreve a resposta usando só o que foi recuperado.
 *    Sem a chave, a barra mostra os achados e os números, sem texto da IA.
 */

export interface Achado {
  tipo: "mensagem" | "lead" | "link";
  titulo: string;
  trecho: string;
  quando?: string;
  leadId?: string;
}

export interface RespostaDaBusca {
  pergunta: string;
  resposta: string | null;
  iaLigada: boolean;
  numeros: Numeros;
  achados: Achado[];
}

interface Numeros {
  leads7: number;
  leads30: number;
  qualificados30: number;
  clientes30: number;
  porLink: { nome: string; campanha: string | null; cliques: number; leads: number }[];
}

const LIMITE_DA_PERGUNTA = 300;

/** Só dígitos com 4 ou mais: parece pedaço de telefone. */
export function digitosDeTelefone(pergunta: string): string | null {
  const d = pergunta.replace(/\D/g, "");
  return d.length >= 4 ? d : null;
}

/** Palavras que valem para busca em nome (tira as curtas e as de pergunta). */
const PALAVRAS_VAZIAS = new Set([
  "quantos", "quantas", "quais", "qual", "quem", "como", "onde", "quando", "leads", "lead", "essa", "esta",
  "semana", "hoje", "ontem", "mês", "mes", "para", "pelo", "pela", "com", "sem", "que", "dos", "das", "uma", "um",
]);
export function termosDeNome(pergunta: string): string[] {
  return pergunta
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
    .slice(0, 5);
}

/** O texto que vai para o Gemini: só o contexto recuperado, nada além. */
export function montaContexto(numeros: Numeros, achados: Achado[]): string {
  const linhas = [
    `Leads nos últimos 7 dias: ${numeros.leads7}. Nos últimos 30 dias: ${numeros.leads30}.`,
    `Qualificados (30 dias): ${numeros.qualificados30}. Viraram clientes (30 dias): ${numeros.clientes30}.`,
    "Links rastreáveis (cliques e leads de todo o período):",
    ...numeros.porLink.map((l) => `- ${l.nome}${l.campanha ? ` (campanha ${l.campanha})` : ""}: ${l.cliques} cliques, ${l.leads} leads`),
    "Trechos encontrados:",
    ...achados.map((a) => `- [${a.tipo}] ${a.titulo}${a.quando ? ` em ${a.quando}` : ""}: ${a.trecho}`),
  ];
  return linhas.join("\n");
}

@Injectable()
export class BuscaService {
  private readonly logger = new Logger(BuscaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pergunta(organizationId: string, entrada: unknown): Promise<RespostaDaBusca> {
    const pergunta = typeof entrada === "string" ? entrada.trim().slice(0, LIMITE_DA_PERGUNTA) : "";
    if (pergunta.length < 2) throw new BadRequestException("Escreva uma pergunta.");

    const [numeros, mensagens, leads, links] = await Promise.all([
      this.numeros(organizationId),
      this.mensagens(organizationId, pergunta),
      this.leads(organizationId, pergunta),
      this.links(organizationId, pergunta),
    ]);
    const achados = [...leads, ...links, ...mensagens];
    const chave = process.env.GEMINI_API_KEY?.trim();
    const resposta = chave ? await this.gera(chave, pergunta, montaContexto(numeros, achados)) : null;
    return { pergunta, resposta, iaLigada: !!chave, numeros, achados };
  }

  private async numeros(org: string): Promise<Numeros> {
    const [linha] = await this.prisma.$queryRaw<
      { leads7: bigint; leads30: bigint; qualificados30: bigint; clientes30: bigint }[]
    >`
      SELECT
        count(*) FILTER (WHERE first_contact_at >= now() - interval '7 days')  AS leads7,
        count(*) FILTER (WHERE first_contact_at >= now() - interval '30 days') AS leads30,
        count(*) FILTER (WHERE qualified_at >= now() - interval '30 days')     AS qualificados30,
        count(*) FILTER (WHERE coalesce(won_at, meeting_scheduled_at) >= now() - interval '30 days') AS clientes30
      FROM leads WHERE organization_id = ${org}`;
    const porLink = await this.prisma.$queryRaw<
      { nome: string; campanha: string | null; cliques: bigint; leads: bigint }[]
    >`
      SELECT tl.name AS nome, tl.default_campaign AS campanha,
             count(DISTINCT tc.id) AS cliques, count(DISTINCT a.lead_id) AS leads
      FROM tracking_links tl
      LEFT JOIN tracking_clicks tc ON tc.tracking_link_id = tl.id
      LEFT JOIN attributions a ON a.tracking_click_id = tc.id
      WHERE tl.organization_id = ${org} AND tl.deleted_at IS NULL
      GROUP BY tl.id ORDER BY count(DISTINCT tc.id) DESC LIMIT 30`;
    return {
      leads7: Number(linha?.leads7 ?? 0),
      leads30: Number(linha?.leads30 ?? 0),
      qualificados30: Number(linha?.qualificados30 ?? 0),
      clientes30: Number(linha?.clientes30 ?? 0),
      porLink: porLink.map((l) => ({ nome: l.nome, campanha: l.campanha, cliques: Number(l.cliques), leads: Number(l.leads) })),
    };
  }

  private async mensagens(org: string, pergunta: string): Promise<Achado[]> {
    const linhas = await this.prisma.$queryRaw<
      { lead_id: string; nome: string | null; telefone: string; trecho: string; quando: Date }[]
    >`
      SELECT l.id AS lead_id, l.name AS nome, l.raw_phone AS telefone, m.timestamp AS quando,
             ts_headline('portuguese', m.text, q, 'MaxWords=25, MinWords=8, StartSel=«, StopSel=»') AS trecho
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN leads l ON l.id = c.lead_id,
           websearch_to_tsquery('portuguese', ${pergunta}) q
      WHERE c.organization_id = ${org}
        AND to_tsvector('portuguese', coalesce(m.text, '')) @@ q
      ORDER BY ts_rank(to_tsvector('portuguese', coalesce(m.text, '')), q) DESC, m.timestamp DESC
      LIMIT 12`;
    return linhas.map((l) => ({
      tipo: "mensagem",
      titulo: l.nome ?? l.telefone,
      trecho: l.trecho,
      quando: l.quando.toISOString().slice(0, 10),
      leadId: l.lead_id,
    }));
  }

  private async leads(org: string, pergunta: string): Promise<Achado[]> {
    const digitos = digitosDeTelefone(pergunta);
    const termos = termosDeNome(pergunta);
    if (!digitos && termos.length === 0) return [];
    const ou = [
      ...(digitos ? [{ normalizedPhone: { contains: digitos } }] : []),
      ...termos.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })),
    ];
    const leads = await this.prisma.lead.findMany({
      where: { organizationId: org, OR: ou },
      orderBy: { lastContactAt: "desc" },
      take: 8,
      select: { id: true, name: true, rawPhone: true, status: true, firstContactAt: true },
    });
    return leads.map((l) => ({
      tipo: "lead",
      titulo: l.name ?? l.rawPhone,
      trecho: `${l.rawPhone} · situação ${l.status}`,
      quando: l.firstContactAt.toISOString().slice(0, 10),
      leadId: l.id,
    }));
  }

  private async links(org: string, pergunta: string): Promise<Achado[]> {
    const termos = termosDeNome(pergunta);
    if (termos.length === 0) return [];
    const links = await this.prisma.trackingLink.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        OR: termos.flatMap((t) => [
          { name: { contains: t, mode: "insensitive" as const } },
          { defaultCampaign: { contains: t, mode: "insensitive" as const } },
        ]),
      },
      take: 6,
      include: { _count: { select: { clicks: true } } },
    });
    return links.map((l) => ({
      tipo: "link",
      titulo: l.name,
      trecho: `/r/${l.code} · ${l._count.clicks} cliques${l.defaultCampaign ? ` · campanha ${l.defaultCampaign}` : ""}`,
    }));
  }

  private async gera(chave: string, pergunta: string, contexto: string): Promise<string | null> {
    const modelo = process.env.GEMINI_MODELO?.trim() || "gemini-2.5-flash";
    const instrucao =
      "Você é o assistente da plataforma de rastreamento. Responda em português do Brasil, em até 5 frases, " +
      "usando SOMENTE os dados do contexto. Se o contexto não tiver a resposta, diga isso claramente. " +
      "Não invente números nem nomes.";
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": chave },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instrucao }] },
            contents: [{ role: "user", parts: [{ text: `Contexto:\n${contexto}\n\nPergunta: ${pergunta}` }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok) {
        this.logger.warn(`Gemini respondeu ${r.status}`);
        return null;
      }
      const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() || null;
    } catch (e) {
      this.logger.warn(`Gemini falhou: ${(e as Error).message}`);
      return null;
    }
  }
}
