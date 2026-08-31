import { PrismaClient, LeadStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";

/**
 * Gera um histórico de demonstração com forma de negócio real.
 *
 * Existe porque dado de teste sem forma deforma a interface: 24 leads criados
 * todos no mesmo dia produzem um gráfico plano com um pico no fim, que parece
 * defeito mesmo estando certo, e impedem avaliar qualquer decisão de desenho.
 *
 * Três travas, porque um gerador de dados solto é perigoso:
 *
 * 1. Só roda por comando explícito (`pnpm --filter api seed:demo`).
 * 2. Escreve numa organização própria, identificada pelo slug abaixo, e nunca
 *    toca em nenhuma outra. Rodar de novo limpa apenas essa.
 * 3. Recusa rodar quando NODE_ENV é production.
 */

const SLUG = "demonstracao";
const DIAS = 90;

const prisma = new PrismaClient();

/**
 * Gerador com semente fixa: a mesma execução produz o mesmo histórico.
 * Sem isso, comparar duas versões de uma tela seria impossível, porque os
 * dados mudariam junto com o desenho.
 */
function criarAleatorio(semente: number) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

const aleatorio = criarAleatorio(20260831);

const escolher = <T,>(lista: T[]): T => lista[Math.floor(aleatorio() * lista.length)];
const entre = (min: number, max: number) => min + Math.floor(aleatorio() * (max - min + 1));

/** Falas do lead e da equipe, para a conversa ter cara de conversa. */
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

function sortearOrigem() {
  const total = ORIGENS.reduce((s, o) => s + o.peso, 0);
  let ponto = aleatorio() * total;
  for (const origem of ORIGENS) {
    ponto -= origem.peso;
    if (ponto <= 0) return origem;
  }
  return ORIGENS[ORIGENS.length - 1];
}

/**
 * Volume do dia. Fim de semana rende bem menos, e há uma tendência leve de
 * alta ao longo do período: é assim que a operação de um cliente se parece,
 * e é isso que faz o gráfico ter o que mostrar.
 */
function leadsDoDia(diasAtras: number, data: Date): number {
  const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
  const tendencia = 1 + (DIAS - diasAtras) / DIAS * 0.6;
  const base = fimDeSemana ? entre(0, 2) : entre(2, 7);
  return Math.max(0, Math.round(base * tendencia));
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed:demo não roda em produção.");
  }

  const senha = await bcrypt.hash("demo123456", 10);

  // Recria só a organização de demonstração. O cascade do schema leva junto
  // leads, conversas, eventos e vendas dela, e nada de mais ninguém.
  //
  // O usuário sai à parte: ele não pertence à organização, então o cascade não
  // o alcança e a segunda execução colidiria no e-mail único.
  await prisma.organization.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: "demo@demonstracao.local" } });

  const org = await prisma.organization.create({
    data: {
      name: "Demonstração",
      slug: SLUG,
      brandColor: "#007D5E",
      memberships: {
        create: {
          role: "OWNER",
          user: {
            create: {
              name: "Visitante Demo",
              email: "demo@demonstracao.local",
              passwordHash: senha,
            },
          },
        },
      },
      whatsappConnection: {
        create: {
          provider: "EVOLUTION",
          status: "CONNECTED",
          instanceName: `demo-${SLUG}`,
          displayPhoneNumber: "+55 85 90000-0000",
          connectedAt: new Date(),
        },
      },
    },
    include: { whatsappConnection: true },
  });

  const link = await prisma.trackingLink.create({
    data: { organizationId: org.id, name: "Bio do Instagram", code: `demo-bio`, destinationUrl: "https://wa.me/5585900000000" },
  });
  const linkGoogle = await prisma.trackingLink.create({
    data: { organizationId: org.id, name: "Campanha Google", code: `demo-google`, destinationUrl: "https://wa.me/5585900000000" },
  });

  const agora = new Date();
  let criados = 0;
  const contagem = { qualificados: 0, reunioes: 0, vendas: 0, desqualificados: 0 };

  for (let diasAtras = DIAS - 1; diasAtras >= 0; diasAtras -= 1) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() - diasAtras);
    dia.setHours(0, 0, 0, 0);

    for (let i = 0; i < leadsDoDia(diasAtras, dia); i += 1) {
      const contato = new Date(dia);
      // Horário comercial: leads não chegam de madrugada em volume.
      contato.setHours(entre(8, 20), entre(0, 59), 0, 0);

      const origem = sortearOrigem();

      // O funil afunila. Cada porta é uma probabilidade sobre quem passou pela
      // anterior, e não uma fatia sorteada do total.
      const qualifica = aleatorio() < 0.42;
      const marcaReuniao = qualifica && aleatorio() < 0.55;
      const vende = marcaReuniao ? aleatorio() < 0.48 : qualifica && aleatorio() < 0.12;
      const desqualifica = !qualifica && aleatorio() < 0.3;

      let status: LeadStatus = "NEW";
      if (vende) status = "WON";
      else if (marcaReuniao) status = "MEETING_SCHEDULED";
      else if (qualifica) status = "QUALIFIED";

      const emHoras = (h: number) => new Date(contato.getTime() + h * 3600_000);
      const qualificadoEm = qualifica ? emHoras(entre(1, 30)) : null;
      const reuniaoEm = marcaReuniao ? emHoras(entre(24, 96)) : null;
      const vendidoEm = vende ? emHoras(entre(72, 320)) : null;

      // O clique nasce antes: a atribuição aponta para ele por id, então não
      // dá para criar os dois aninhados numa chamada só.
      const clique = origem.link
        ? await prisma.trackingClick.create({
            data: {
              organizationId: org.id,
              trackingLinkId: origem.link === "Bio do Instagram" ? link.id : linkGoogle.id,
              clickedAt: new Date(contato.getTime() - entre(2, 90) * 60_000),
              landingUrl: "https://wa.me/5585900000000",
              utmSource: origem.link === "Bio do Instagram" ? "instagram" : "google",
              utmMedium: origem.link === "Bio do Instagram" ? "social" : "cpc",
              utmCampaign: origem.link === "Bio do Instagram" ? "bio-permanente" : "busca-marca",
            },
          })
        : null;

      const lead = await prisma.lead.create({
        data: {
          organizationId: org.id,
          name: escolher(NOMES),
          normalizedPhone: `+5585${String(900000000 + criados).slice(0, 9)}`,
          rawPhone: `5585${String(900000000 + criados).slice(0, 9)}`,
          status,
          firstContactAt: contato,
          lastContactAt: vendidoEm ?? reuniaoEm ?? qualificadoEm ?? contato,
          qualifiedAt: qualificadoEm,
          meetingScheduledAt: reuniaoEm,
          wonAt: vendidoEm,
          disqualifiedAt: desqualifica ? emHoras(entre(2, 48)) : null,
          disqualifiedReason: desqualifica ? escolher(["Sem perfil", "Sem verba", "Era engano"]) : null,
          attribution: {
            create: {
              organizationId: org.id,
              method: origem.metodo,
              confidence: origem.metodo === "UNKNOWN" ? "NONE" : "HIGH",
              attributedAt: contato,
              evidence: origem.metodo === "UNKNOWN" ? undefined : { gerado: true, origem: origem.link ?? "anuncio" },
              ...(clique ? { trackingClickId: clique.id } : {}),
            },
          },
          ...(vende
            ? {
                sale: {
                  create: {
                    organizationId: org.id,
                    // Uma em cada cinco vendas sem valor confirmado, como na
                    // vida real: o sistema nunca inventa um número que ninguém
                    // disse na conversa.
                    amountCents: aleatorio() < 0.8 ? entre(40, 600) * 1000 : null,
                    classifierType: aleatorio() < 0.7 ? "RULE" : "MANUAL",
                    detectedAt: vendidoEm!,
                  },
                },
              }
            : {}),
        },
      });

      /*
        Conversa. Sem ela a ficha do lead nasce vazia e as métricas de
        atendimento não têm o que medir: o tempo até a primeira resposta sai
        do intervalo entre a primeira mensagem do lead e a primeira da equipe.
      */
      const conversa = await prisma.conversation.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          whatsappConnectionId: org.whatsappConnection!.id,
          startedAt: contato,
          lastMessageAt: contato,
        },
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

      for (let t = 0; t < trocas; t += 1) {
        mensagens.push({
          conversationId: conversa.id,
          direction: "INBOUND",
          type: "TEXT",
          text: escolher(FALAS_LEAD),
          timestamp: new Date(quando),
          outboundStatus: null,
          externalId: `demo-${lead.id}-${t}-in`,
        });

        // Resposta da equipe: minutos para a maioria, horas de vez em quando.
        // É essa variação que faz a métrica de atendimento ter o que mostrar.
        const demora = aleatorio() < 0.75 ? entre(1, 25) : entre(60, 480);
        quando = new Date(quando.getTime() + demora * 60_000);

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

      // Alguns leads ficam com a bola do nosso lado, para "aguardando
      // resposta" existir na tela em vez de ser sempre zero.
      if (!qualifica && aleatorio() < 0.45) {
        mensagens.pop();
      }

      await prisma.message.createMany({ data: mensagens });
      await prisma.conversation.update({
        where: { id: conversa.id },
        data: { lastMessageAt: mensagens[mensagens.length - 1].timestamp },
      });

      // Eventos de linha do tempo, para a ficha do lead não nascer vazia.
      const eventos: { type: "LEAD_CREATED" | "QUALIFIED" | "MEETING_SCHEDULED" | "SALE_DETECTED" | "DISQUALIFIED"; occurredAt: Date }[] = [
        { type: "LEAD_CREATED", occurredAt: contato },
      ];
      if (qualificadoEm) eventos.push({ type: "QUALIFIED", occurredAt: qualificadoEm });
      if (reuniaoEm) eventos.push({ type: "MEETING_SCHEDULED", occurredAt: reuniaoEm });
      if (vendidoEm) eventos.push({ type: "SALE_DETECTED", occurredAt: vendidoEm });
      if (desqualifica) eventos.push({ type: "DISQUALIFIED", occurredAt: emHoras(entre(2, 48)) });

      await prisma.leadEvent.createMany({
        data: eventos.map((e) => ({ ...e, organizationId: org.id, leadId: lead.id, metadata: { gerado: true } })),
      });

      criados += 1;
      if (qualifica) contagem.qualificados += 1;
      if (marcaReuniao) contagem.reunioes += 1;
      if (vende) contagem.vendas += 1;
      if (desqualifica) contagem.desqualificados += 1;
    }
  }

  console.log(`\nOrganização "Demonstração" recriada com ${DIAS} dias de histórico.`);
  console.log(`  ${criados} leads`);
  console.log(`  ${contagem.qualificados} qualificados`);
  console.log(`  ${contagem.reunioes} reuniões`);
  console.log(`  ${contagem.vendas} vendas`);
  console.log(`  ${contagem.desqualificados} desqualificados`);
  console.log(`\nEntre com demo@demonstracao.local / demo123456\n`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
