import { LeadStatus, PrismaClient } from "@prisma/client";

/**
 * Preenche uma organização de demonstração com um histórico com forma de
 * negócio real: volume que cresce, fim de semana mais fraco, um funil que
 * afunila, conversas com tempo de resposta variado e três campanhas.
 *
 * Usado pelo `seed:demo` local e pelo botão "Abrir a demonstração" da área da
 * Timeless. Só escreve na organização recebida; quem chama garante que ela é
 * de demonstração.
 *
 * Semente fixa: a mesma execução produz o mesmo histórico, para dois
 * desenhos de tela poderem ser comparados com os mesmos dados.
 */
export async function preencheDemonstracao(
  prisma: PrismaClient,
  organizationId: string,
  whatsappConnectionId: string,
  opcoes: { dias?: number; semente?: number } = {},
): Promise<{ leads: number; vendas: number }> {
  const dias = opcoes.dias ?? 90;
  const aleatorio = criarAleatorio(opcoes.semente ?? 20260831);
  const escolher = <T>(lista: T[]): T => lista[Math.floor(aleatorio() * lista.length)];
  const entre = (min: number, max: number) => min + Math.floor(aleatorio() * (max - min + 1));

  const sortearOrigem = () => {
    const total = ORIGENS.reduce((s, o) => s + o.peso, 0);
    let ponto = aleatorio() * total;
    for (const origem of ORIGENS) {
      ponto -= origem.peso;
      if (ponto <= 0) return origem;
    }
    return ORIGENS[ORIGENS.length - 1];
  };

  // Fim de semana rende menos, e há uma alta leve ao longo do período.
  const leadsDoDia = (diasAtras: number, data: Date) => {
    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const tendencia = 1 + ((dias - diasAtras) / dias) * 0.6;
    const base = fimDeSemana ? entre(0, 2) : entre(2, 7);
    return Math.max(0, Math.round(base * tendencia));
  };

  // O código do link é único no sistema inteiro: leva um pedaço do id da organização.
  const sufixo = organizationId.slice(0, 8);
  const link = await prisma.trackingLink.create({
    data: { organizationId, name: "Bio do Instagram", code: `demo-bio-${sufixo}`, destinationUrl: "https://wa.me/5585900000000" },
  });
  const linkGoogle = await prisma.trackingLink.create({
    data: { organizationId, name: "Campanha Google", code: `demo-google-${sufixo}`, destinationUrl: "https://wa.me/5585900000000" },
  });

  const agora = new Date();
  let criados = 0;
  let vendas = 0;

  for (let diasAtras = dias - 1; diasAtras >= 0; diasAtras -= 1) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() - diasAtras);
    dia.setHours(0, 0, 0, 0);

    for (let i = 0; i < leadsDoDia(diasAtras, dia); i += 1) {
      const contato = new Date(dia);
      contato.setHours(entre(8, 20), entre(0, 59), 0, 0);
      // Lead de hoje que ainda "não chegou" fica para amanhã.
      if (contato > agora) continue;

      const origem = sortearOrigem();
      const qualifica = aleatorio() < 0.42;
      const marcaReuniao = qualifica && aleatorio() < 0.55;
      const vende = marcaReuniao ? aleatorio() < 0.48 : qualifica && aleatorio() < 0.12;
      const desqualifica = !qualifica && aleatorio() < 0.3;

      let status: LeadStatus = "NEW";
      if (vende) status = "WON";
      else if (marcaReuniao) status = "MEETING_SCHEDULED";
      else if (qualifica) status = "QUALIFIED";

      const emHoras = (h: number) => new Date(contato.getTime() + h * 3600_000);
      const ate = (data: Date) => (data > agora ? agora : data);
      const qualificadoEm = qualifica ? ate(emHoras(entre(1, 30))) : null;
      const reuniaoEm = marcaReuniao ? ate(emHoras(entre(24, 96))) : null;
      const vendidoEm = vende ? ate(emHoras(entre(72, 320))) : null;

      const doInstagram = origem.link === "Bio do Instagram";
      const clique = origem.link
        ? await prisma.trackingClick.create({
            data: {
              organizationId,
              trackingLinkId: doInstagram ? link.id : linkGoogle.id,
              clickedAt: new Date(contato.getTime() - entre(2, 90) * 60_000),
              landingUrl: "https://wa.me/5585900000000",
              utmSource: doInstagram ? "instagram" : "google",
              utmMedium: doInstagram ? "social" : "cpc",
              utmCampaign: doInstagram ? "bio-permanente" : "busca-marca",
              ...(doInstagram ? {} : { campaignId: "demo-google-pesquisa", gclid: `demo-gclid-${sufixo}-${criados}` }),
            },
          })
        : null;

      const telefone = String(900000000 + criados).slice(0, 9);
      const lead = await prisma.lead.create({
        data: {
          organizationId,
          name: escolher(NOMES),
          normalizedPhone: `+5585${telefone}`,
          rawPhone: `5585${telefone}`,
          status,
          firstContactAt: contato,
          lastContactAt: vendidoEm ?? reuniaoEm ?? qualificadoEm ?? contato,
          qualifiedAt: qualificadoEm,
          meetingScheduledAt: reuniaoEm,
          wonAt: vendidoEm,
          disqualifiedAt: desqualifica ? ate(emHoras(entre(2, 48))) : null,
          disqualifiedReason: desqualifica ? escolher(["Sem perfil", "Sem verba", "Era engano"]) : null,
          attribution: {
            create: {
              organizationId,
              method: origem.metodo,
              confidence: origem.metodo === "UNKNOWN" ? "NONE" : "HIGH",
              attributedAt: contato,
              evidence: origem.metodo === "UNKNOWN" ? undefined : { gerado: true, origem: origem.link ?? "anuncio" },
              ...(clique ? { trackingClickId: clique.id } : {}),
            },
          },
          ...(vende
            ? {
                sales: {
                  create: {
                    organizationId,
                    status: "CONFIRMED",
                    confirmedAt: vendidoEm!,
                    occurredAt: vendidoEm!,
                    // Uma em cada cinco sem valor, como na vida real.
                    amountCents: aleatorio() < 0.8 ? entre(40, 600) * 1000 : null,
                    classifierType: aleatorio() < 0.7 ? "RULE" : "MANUAL",
                    detectedAt: vendidoEm!,
                  },
                },
              }
            : {}),
        },
      });

      const conversa = await prisma.conversation.create({
        data: { organizationId, leadId: lead.id, whatsappConnectionId, startedAt: contato, lastMessageAt: contato },
      });

      // Quem qualifica troca mais mensagens; quem some manda uma e para.
      const trocas = qualifica ? entre(3, 7) : entre(1, 2);
      let quando = new Date(contato);
      const mensagens: {
        conversationId: string;
        direction: "INBOUND" | "OUTBOUND";
        type: "TEXT";
        text: string;
        timestamp: Date;
        outboundStatus: "SENT" | null;
        externalId: string;
      }[] = [];
      for (let t = 0; t < trocas && quando <= agora; t += 1) {
        mensagens.push({
          conversationId: conversa.id,
          direction: "INBOUND",
          type: "TEXT",
          text: escolher(FALAS_LEAD),
          timestamp: new Date(quando),
          outboundStatus: null,
          externalId: `demo-${lead.id}-${t}-in`,
        });
        // Minutos para a maioria, horas de vez em quando.
        const demora = aleatorio() < 0.75 ? entre(1, 25) : entre(60, 480);
        quando = new Date(quando.getTime() + demora * 60_000);
        if (quando > agora) break;
        mensagens.push({
          conversationId: conversa.id,
          direction: "OUTBOUND",
          type: "TEXT",
          text: escolher(FALAS_EQUIPE),
          timestamp: new Date(quando),
          outboundStatus: "SENT",
          externalId: `demo-${lead.id}-${t}-out`,
        });
        quando = new Date(quando.getTime() + entre(20, 600) * 60_000);
      }
      // Alguns ficam com a bola do nosso lado, para "aguardando resposta" existir.
      if (!qualifica && mensagens.length > 1 && aleatorio() < 0.45) mensagens.pop();

      await prisma.message.createMany({ data: mensagens });
      await prisma.conversation.update({
        where: { id: conversa.id },
        data: { lastMessageAt: mensagens[mensagens.length - 1].timestamp },
      });

      const eventos: { type: "LEAD_CREATED" | "QUALIFIED" | "MEETING_SCHEDULED" | "SALE_DETECTED" | "DISQUALIFIED"; occurredAt: Date }[] = [
        { type: "LEAD_CREATED", occurredAt: contato },
      ];
      if (qualificadoEm) eventos.push({ type: "QUALIFIED", occurredAt: qualificadoEm });
      if (reuniaoEm) eventos.push({ type: "MEETING_SCHEDULED", occurredAt: reuniaoEm });
      if (vendidoEm) eventos.push({ type: "SALE_DETECTED", occurredAt: vendidoEm });
      if (desqualifica) eventos.push({ type: "DISQUALIFIED", occurredAt: ate(emHoras(entre(2, 48))) });
      await prisma.leadEvent.createMany({
        data: eventos.map((e) => ({ ...e, organizationId, leadId: lead.id, metadata: { gerado: true } })),
      });

      criados += 1;
      if (vende) vendas += 1;
    }
  }

  await criaCampanhas(prisma, organizationId, dias, entre);
  return { leads: criados, vendas };
}

/**
 * Três campanhas com o desenho de uma conta real: um vídeo de alcance, uma de
 * conversas no WhatsApp e uma de pesquisa no Google, com gasto e entrega por
 * dia. É o que a tela de campanhas precisa para julgar cada uma pelo trabalho.
 */
async function criaCampanhas(
  prisma: PrismaClient,
  organizationId: string,
  dias: number,
  entre: (min: number, max: number) => number,
) {
  const campanhas = [
    { externalId: "demo-meta-video", name: "Vídeo de apresentação do escritório", platform: "META" as const, objetivo: "OUTCOME_AWARENESS", gasto: [250, 450], impressoes: [1800, 3200], cliques: [4, 14], video: [380, 720], conversas: [0, 0] },
    { externalId: "demo-meta-conversas", name: "Conversas no WhatsApp", platform: "META" as const, objetivo: "OUTCOME_ENGAGEMENT", gasto: [1800, 2600], impressoes: [2200, 3600], cliques: [30, 60], video: [0, 0], conversas: [1, 4] },
    { externalId: "demo-google-pesquisa", name: "Pesquisa: advogado trabalhista", platform: "GOOGLE" as const, objetivo: "GOOGLE_SEARCH", gasto: [900, 1500], impressoes: [300, 600], cliques: [18, 40], video: null, conversas: null },
  ];
  const hoje = new Date();
  for (const c of campanhas) {
    const campanha = await prisma.campaign.create({
      data: { organizationId, externalId: c.externalId, name: c.name, platform: c.platform, status: "ACTIVE", objetivo: c.objetivo, manual: false, lastSyncedAt: new Date() },
    });
    await prisma.adSpend.createMany({
      data: Array.from({ length: dias }, (_, d) => ({
        campaignId: campanha.id,
        date: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - d)),
        spendCents: entre(c.gasto[0], c.gasto[1]),
        impressoes: entre(c.impressoes[0], c.impressoes[1]),
        cliques: entre(c.cliques[0], c.cliques[1]),
        visualizacoesDeVideo: c.video ? entre(c.video[0], c.video[1]) : null,
        conversasIniciadas: c.conversas ? entre(c.conversas[0], c.conversas[1]) : null,
      })),
    });
  }
}

function criarAleatorio(semente: number) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

const FALAS_LEAD = [
  "Oi, vi seu anúncio e queria saber mais",
  "Bom dia! Vocês atendem minha região?",
  "Qual o valor do serviço?",
  "Consigo agendar essa semana?",
  "Perfeito, era isso que eu procurava",
  "Vou pensar e te retorno",
  "Pode me mandar mais detalhes?",
];

const FALAS_EQUIPE = [
  "Olá! Claro, posso te explicar tudo",
  "Bom dia! Atendemos sim, me conta um pouco do seu caso",
  "Depende do que você precisa, posso te passar as opções",
  "Consigo sim, tenho horário na terça e na quinta",
  "Fico à disposição para qualquer dúvida",
  "Acabei de te mandar por e-mail também",
];

const NOMES = [
  "Ana Beatriz", "Carlos Eduardo", "Marina Souza", "Rafael Lima", "Juliana Alves",
  "Pedro Henrique", "Camila Ferreira", "Lucas Martins", "Fernanda Rocha", "Bruno Carvalho",
  "Patrícia Gomes", "Thiago Barbosa", "Larissa Ribeiro", "Diego Nunes", "Amanda Castro",
  "Rodrigo Pinto", "Vanessa Dias", "Felipe Moraes", "Bianca Teixeira", "Gustavo Freitas",
];

/** Origens com peso: a maioria dos leads de um cliente real não tem evidência. */
const ORIGENS = [
  { metodo: "CTWA_REFERRAL" as const, link: null, peso: 34 },
  { metodo: "TRACKING_LINK" as const, link: "Bio do Instagram", peso: 22 },
  { metodo: "TRACKING_LINK" as const, link: "Campanha Google", peso: 12 },
  { metodo: "UNKNOWN" as const, link: null, peso: 32 },
];
