/**
 * Teste da IA de vendas.
 *
 * Lê conversas de um banco, pede ao Claude que diga se cada uma terminou em
 * venda e compara com o que pessoas e a regra de palavras já decidiram. Só lê
 * do banco: não grava nada nele.
 *
 *   pnpm --filter api teste:ia-vendas -- --sem-api            ensaio, sem chamar a IA nem gastar nada
 *   pnpm --filter api teste:ia-vendas -- --modelos haiku,sonnet --max 150
 *   pnpm --filter api teste:ia-vendas -- --avaliar            confere a planilha revisao.csv preenchida
 *
 * A chave da API vem do ambiente (ANTHROPIC_API_KEY), nunca de um arquivo do projeto.
 */
import * as path from "node:path";
import * as fs from "node:fs";
import * as readline from "node:readline/promises";
import * as dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma, PrismaClient } from "@prisma/client";
import { analisarConversa, executaEmParalelo } from "../src/sales/ia/analisador";
import { vendaSegundoAIA } from "../src/sales/ia/analise";
import { escolheAmostra } from "../src/sales/ia/amostra";
import { custoEmDolares, estimaTokens, MODELOS } from "../src/sales/ia/custo";
import { derivaGabarito } from "../src/sales/ia/gabarito";
import { PROMPT_DO_SISTEMA } from "../src/sales/ia/prompt";
import {
  avaliaRevisao,
  divergentes,
  leCsv,
  LinhaDoTeste,
  relatorioEmHtml,
  resumoDoModelo,
  revisaoEmCsv,
} from "../src/sales/ia/relatorio";
import { montaTranscricao } from "../src/sales/ia/transcricao";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function lerArgumentos(argv: string[]): Record<string, string | true> {
  const saida: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const chave = argv[i].slice(2);
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) saida[chave] = true;
    else {
      saida[chave] = proximo;
      i += 1;
    }
  }
  return saida;
}

const texto = (v: string | true | undefined, padrao: string) => (typeof v === "string" ? v : padrao);
const numero = (v: string | true | undefined, padrao: number) => (typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : padrao);

function resolveModelos(pedido: string): string[] {
  return pedido
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => {
      if (m in MODELOS) return MODELOS[m as keyof typeof MODELOS];
      if (m.startsWith("claude-")) return m;
      throw new Error(`Modelo desconhecido: "${m}". Use haiku, sonnet, opus ou um id que comece com claude-.`);
    });
}

const AJUDA = `Teste da IA de vendas

  --sem-api           ensaio: monta as conversas e estima o custo, sem chamar a IA
  --modelos a,b       haiku, sonnet, opus (padrão: sonnet)
  --max N             quantas conversas analisar (padrão: 150)
  --min-mensagens N   ignora conversas menores que isto (padrão: 3)
  --org texto         só uma empresa (nome ou id)
  --semente N         muda o sorteio (padrão: 42)
  --concorrencia N    chamadas ao mesmo tempo (padrão: 4)
  --saida pasta       onde gravar os resultados (padrão: resultado-teste-ia)
  --sim               não pergunta antes de enviar as conversas
  --avaliar           lê revisao.csv preenchida e diz quem acertou mais
`;

async function avaliar(pasta: string) {
  const linhas = JSON.parse(fs.readFileSync(path.join(pasta, "resultado.json"), "utf8")) as { modelos: string[]; linhas: LinhaDoTeste[] };
  const planilha = leCsv(fs.readFileSync(path.join(pasta, "revisao.csv"), "utf8"));
  const r = avaliaRevisao(linhas.linhas, linhas.modelos, planilha);
  if (r.julgadas === 0) {
    console.log("Nenhuma linha da coluna `verdade` foi preenchida (use VENDA ou SEM_VENDA).");
    return;
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "sem casos");
  console.log(`Conversas julgadas por você: ${r.julgadas}`);
  console.log(`Sistema de hoje (referência) acertou: ${r.referenciaAcertou} de ${r.julgadas} (${pct(r.referenciaAcertou, r.julgadas)})`);
  for (const m of r.porModelo) {
    console.log(
      `${m.modelo}: acertou ${m.acertou} de ${r.julgadas} (${pct(m.acertou, r.julgadas)}). ` +
        `Vendas reais achadas: ${m.vendasAcertadas} de ${m.vendasReais}. Falsas vendas: ${m.falsasVendas}.`,
    );
  }
  console.log("\nAtenção: estas são só as conversas em que a IA discordava. Onde ela concordava com a referência, o acerto é bem maior.");
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));
  if (args.ajuda) return console.log(AJUDA);

  const pasta = texto(args.saida, "resultado-teste-ia");
  if (args.avaliar) return avaliar(pasta);

  const semApi = args["sem-api"] === true;
  const max = numero(args.max, 150);
  const minimo = numero(args["min-mensagens"], 3);
  const modelos = resolveModelos(texto(args.modelos, "sonnet"));

  if (!semApi && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Falta a chave da API. No terminal, antes de rodar:\n\n  export ANTHROPIC_API_KEY=sua-chave\n\n" +
        "(ela fica só naquele terminal, não vai para arquivo nenhum do projeto). Para um ensaio sem custo, use --sem-api.",
    );
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL: o banco de onde ler as conversas (somente leitura).");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    // --- 1. Quais conversas existem
    let organizacoes: { id: string; name: string }[] | undefined;
    if (typeof args.org === "string") {
      organizacoes = await prisma.organization.findMany({
        where: { OR: [{ id: args.org }, { name: { contains: args.org, mode: "insensitive" } }] },
        select: { id: true, name: true },
      });
      if (!organizacoes.length) throw new Error(`Nenhuma empresa com "${args.org}".`);
    }
    const filtroOrg = organizacoes ? Prisma.sql`AND l.organization_id IN (${Prisma.join(organizacoes.map((o) => o.id))})` : Prisma.empty;
    const contagens = await prisma.$queryRaw<{ id: string; n: number }[]>`
      SELECT l.id, COUNT(m.id)::int AS n
      FROM leads l
      JOIN conversations c ON c.lead_id = l.id
      JOIN messages m ON m.conversation_id = c.id
      WHERE true ${filtroOrg}
      GROUP BY l.id
      HAVING COUNT(m.id) >= ${minimo}`;
    console.log(`${contagens.length} conversas com pelo menos ${minimo} mensagens.`);

    // --- 2. O que pessoas e o sistema decidiram sobre cada uma
    const leads = [];
    for (let i = 0; i < contagens.length; i += 500) {
      leads.push(
        ...(await prisma.lead.findMany({
          where: { id: { in: contagens.slice(i, i + 500).map((c) => c.id) } },
          select: {
            id: true,
            organizationId: true,
            name: true,
            disqualifiedAt: true,
            organization: { select: { name: true } },
            sales: { select: { status: true, confirmationSource: true, deletedAt: true } },
          },
        })),
      );
    }
    const candidatas = leads.map((lead) => ({ lead, ...derivaGabarito(lead) }));
    const humanos = candidatas.filter((c) => c.humano === "VENDA").length;
    const regra = candidatas.filter((c) => c.humano === null && c.sistema === "VENDA").length;
    console.log(`Vendas confirmadas por pessoas: ${humanos}. Detectadas só pela regra, sem confirmação: ${regra}.`);

    const escolhidas = escolheAmostra(candidatas, max, numero(args.semente, 42));
    console.log(`Amostra: ${escolhidas.length} conversas.`);

    // --- 3. Montar o texto de cada uma, sem dados pessoais
    const ids = escolhidas.map((e) => e.lead.id);
    const mensagens = await prisma.message.findMany({
      where: { conversation: { leadId: { in: ids } } },
      select: { direction: true, text: true, timestamp: true, conversation: { select: { leadId: true } } },
    });
    const porLead = new Map<string, typeof mensagens>();
    for (const m of mensagens) porLead.set(m.conversation.leadId, [...(porLead.get(m.conversation.leadId) ?? []), m]);

    const regras = await prisma.classificationRule.findMany({
      where: { organizationId: { in: [...new Set(escolhidas.map((e) => e.lead.organizationId))] }, targetStatus: "WON" },
      select: { organizationId: true, phrase: true },
    });
    const dicasDaOrg = (orgId: string) => regras.filter((r) => r.organizationId === orgId).map((r) => r.phrase);

    const base = escolhidas.map((e) => {
      const t = montaTranscricao(porLead.get(e.lead.id) ?? [], { nomes: e.lead.name ? [e.lead.name] : [] });
      return { e, t, dicas: dicasDaOrg(e.lead.organizationId) };
    });

    // Conferência de privacidade: sobrou telefone, e-mail ou documento?
    const vazou = base.filter(({ t }) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(t.texto) || /\d(?:[\s().-]?\d){9,}/.test(t.texto)).length;
    console.log(`Conferência de privacidade: ${vazou} de ${base.length} conversas ainda com algo parecido com telefone, e-mail ou documento.`);

    // --- 4. Estimativa de custo antes de gastar
    const tokensEntrada = base.map(({ t, dicas }) => estimaTokens(PROMPT_DO_SISTEMA) + estimaTokens(t.texto) + estimaTokens(dicas.join(" ")));
    const mediaEntrada = Math.round(tokensEntrada.reduce((a, b) => a + b, 0) / Math.max(1, tokensEntrada.length));
    const mensagensMedias = Math.round(base.reduce((s, x) => s + x.t.mensagens, 0) / Math.max(1, base.length));
    console.log(`Tamanho médio: ${mensagensMedias} mensagens, cerca de ${mediaEntrada} tokens de entrada (estimativa).`);
    for (const modelo of modelos) {
      const total = base.length ? tokensEntrada.reduce((a, b) => a + custoEmDolares(modelo, { tokensEntrada: b, tokensSaida: 250 }), 0) : 0;
      console.log(`  ${modelo}: custo estimado deste teste US$ ${total.toFixed(2)} (por 1.000 conversas: US$ ${((total / Math.max(1, base.length)) * 1000).toFixed(2)})`);
    }

    if (semApi) {
      console.log("\nEnsaio terminado: nada foi enviado nem gasto. Tire o --sem-api para rodar de verdade.");
      return;
    }

    // --- 5. Confirmação antes de enviar conversas para fora
    if (args.sim !== true) {
      const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
      const resposta = await terminal.question(
        `\nVou enviar ${base.length} conversas, sem nome, telefone e e-mail, para a API da Anthropic (${modelos.join(", ")}).\n` +
          `Elas podem conter outros dados pessoais ou de saúde. Digite "sim" para continuar: `,
      );
      terminal.close();
      if (resposta.trim().toLowerCase() !== "sim") return console.log("Cancelado. Nada foi enviado.");
    }

    // --- 6. Chamar a IA, um modelo de cada vez
    const client = new Anthropic();
    const linhas: LinhaDoTeste[] = base.map(({ e, t }) => ({
      id: e.lead.id,
      organizacao: e.lead.organization.name,
      mensagens: t.mensagens,
      omitidas: t.omitidas,
      midias: t.midias,
      humano: e.humano,
      sistema: e.sistema,
      transcricao: t.texto,
      porModelo: {},
    }));

    for (const modelo of modelos) {
      console.log(`\n${modelo}...`);
      const resultados = await executaEmParalelo(
        base,
        numero(args.concorrencia, 4),
        ({ t, dicas }) => analisarConversa({ client, modelo, transcricao: t.texto, dicas }),
        (feitos, total) => process.stdout.write(`\r  ${feitos}/${total}`),
      );
      resultados.forEach((r, i) => {
        linhas[i].porModelo[modelo] = {
          situacao: r.analise?.situacao ?? null,
          vendaIA: r.analise ? vendaSegundoAIA(r.analise) : null,
          confianca: r.analise?.confianca ?? null,
          valorEmCentavos: r.analise?.valorEmCentavos ?? null,
          evidencias: r.analise?.evidencias ?? [],
          citacoesInvalidas: r.citacoes.invalidas.length,
          motivoDaPerda: r.analise?.motivoDaPerda ?? null,
          qualidadeDoLead: r.analise?.qualidadeDoLead ?? null,
          motivo: r.analise?.motivo ?? null,
          erro: r.erro,
          tokensEntrada: r.tokensEntrada,
          tokensSaida: r.tokensSaida,
          ms: r.ms,
          custo: custoEmDolares(modelo, r),
        };
      });
      process.stdout.write("\n");
    }

    // --- 7. Gravar e resumir
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, "resultado.json"), JSON.stringify({ modelos, geradoEm: new Date().toISOString(), linhas }, null, 1));
    fs.writeFileSync(path.join(pasta, "revisao.csv"), revisaoEmCsv(divergentes(linhas, modelos), modelos));
    fs.writeFileSync(path.join(pasta, "relatorio.html"), relatorioEmHtml({ linhas, modelos, geradoEm: new Date() }));

    console.log("\n=== Resumo ===");
    for (const modelo of modelos) {
      const r = resumoDoModelo(linhas, modelo);
      console.log(
        `${modelo}: custo por 1.000 conversas US$ ${r.custoPorMil.toFixed(2)}; tokens médios ${r.tokensEntradaMedio} entrada / ${r.tokensSaidaMedio} saída; ` +
          `erros ${r.erros}; citações inventadas em ${r.comCitacaoInventada} conversas.\n` +
          `  Vendas confirmadas por pessoas que a IA achou: ${r.contraPessoas.iaEncontrou} de ${r.contraPessoas.vendasConfirmadas}. ` +
          `Sem venda decidida onde a IA disse venda: ${r.contraPessoas.iaDisseVenda} de ${r.contraPessoas.semVendaDecidida}.\n` +
          `  Regra detectou e ninguém confirmou: a IA concorda em ${r.contraSistema.iaConcorda} de ${r.contraSistema.regraSemConfirmacao}. ` +
          `Sistema sem venda onde a IA vê venda: ${r.contraSistema.iaVeVendaPerdida} de ${r.contraSistema.semVendaNoSistema}.`,
      );
    }
    console.log(`\nAbra ${path.join(pasta, "relatorio.html")} e preencha a coluna "verdade" de ${path.join(pasta, "revisao.csv")}.`);
    console.log("Depois rode de novo com --avaliar.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
