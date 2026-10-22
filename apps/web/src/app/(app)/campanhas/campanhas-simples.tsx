import { ListaDeCampanhas } from "./lista-de-campanhas";
import { ORDEM_DOS_TRABALHOS, ROTULO_DO_TRABALHO, Trabalho, trabalhoDaCampanha } from "@/lib/campanhas/trabalho";
import type { CampanhaComparada, DesempenhoDeCampanha, DesempenhoDeCampanhas } from "./tipos";

/** Ligações e rotas de uma campanha do Google, para quem mede presença local. */
export type AcoesLocais = Map<string, { ligacoes: number | null; rotas: number | null }>;

/**
 * A parte de cima de Campanhas, para quem não entende de tráfego.
 *
 * Cada campanha tem um trabalho (ser vista, levar ao WhatsApp, trazer
 * cliente, trazer à loja) e é julgada por ele. Antes toda campanha era cobrada
 * por lead, e um vídeo de alcance que cumpriu o que devia aparecia como
 * "gastando sem retorno". O topo diz para onde foi o dinheiro, dividido por
 * esses trabalhos; a lista diz, em português, o que cada campanha entregou.
 */
export function CampanhasSimples({
  dados,
  medido,
  acoesLocais,
  comLoja,
}: {
  dados: DesempenhoDeCampanhas;
  medido: boolean;
  acoesLocais?: AcoesLocais;
  comLoja: boolean;
}) {
  const linhas = dados.campanhas
    .filter((linha): linha is CampanhaComparada & { atual: DesempenhoDeCampanha } => linha.atual !== null)
    .map((linha) => {
      const locais = acoesLocais?.get(linha.externalId);
      const acoes = (locais?.ligacoes ?? 0) + (locais?.rotas ?? 0);
      return {
        linha,
        atual: linha.atual,
        locais,
        trabalho: trabalhoDaCampanha({ objetivo: linha.objetivo, plataforma: linha.plataforma, acoesLocais: acoes, comLoja }),
      };
    });

  if (linhas.length === 0) {
    return (
      <p className="mb-8 py-10 text-center text-destaque text-ink-mute">Nenhuma campanha com gasto neste período.</p>
    );
  }

  const total = linhas.reduce((soma, l) => soma + l.atual.gastoCentavos, 0);
  const porTrabalho = ORDEM_DOS_TRABALHOS.map((trabalho) => ({
    trabalho,
    itens: linhas.filter((l) => l.trabalho === trabalho),
  })).filter((grupo) => grupo.itens.length > 0);

  // Para dizer se uma campanha está cara, ela é comparada com as do mesmo
  // trabalho: custo por visualização entre vídeos, por cliente entre as de cliente.
  const referencia = referencias(linhas);


  return (
    <div className="mb-10">
      <section className="pb-8 pt-2">
        <p className="max-w-2xl font-display text-[1.6rem] font-medium leading-snug tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          Você investiu {reais(total)}
          {porTrabalho.length > 1 ? ". Cada parte do dinheiro tinha um trabalho diferente:" : "."}
        </p>

        {total > 0 ? (
          <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-panel-soft" aria-hidden>
            {porTrabalho.map(({ trabalho, itens }) => {
              const gasto = itens.reduce((soma, l) => soma + l.atual.gastoCentavos, 0);
              return gasto > 0 ? (
                <div key={trabalho} className={COR[trabalho].barra} style={{ flex: `${gasto} 1 0%` }} />
              ) : null;
            })}
          </div>
        ) : null}

        <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {porTrabalho.map(({ trabalho, itens }) => {
            const gasto = itens.reduce((soma, l) => soma + l.atual.gastoCentavos, 0);
            return (
              <div key={trabalho}>
                <dt className={`text-corpo font-medium ${COR[trabalho].texto}`}>{ROTULO_DO_TRABALHO[trabalho]}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">{reais(gasto)}</dd>
                <dd className="mt-1 text-apoio leading-relaxed text-ink-soft">
                  {resumoDoTrabalho(trabalho, itens.map((l) => ({ atual: l.atual, locais: l.locais })), medido)}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <ListaDeCampanhas
        grupos={porTrabalho.map(({ trabalho, itens }) => {
          const unidade = unidadeDoTrabalho(trabalho, itens.map((l) => l.atual));
          return {
            chave: trabalho,
            titulo: porTrabalho.length > 1 ? ROTULO_DO_TRABALHO[trabalho] : undefined,
            corDoTitulo: COR[trabalho].texto,
            linhas: [...itens]
              .sort((x, y) => y.atual.gastoCentavos - x.atual.gastoCentavos)
              .map(({ linha, atual, locais }) => {
                const juizo = julga(trabalho, atual, locais, referencia, medido);
                return {
                  id: linha.externalId,
                  nome: linha.nome,
                  detalhe: `${PLATAFORMA[linha.plataforma] ?? linha.plataforma}${STATUS[linha.status] ? `, ${STATUS[linha.status]}` : ""}`,
                  gastoCentavos: atual.gastoCentavos,
                  voltou: unidade.valor(atual, locais),
                  unidade: unidade.nome,
                  frase: juizo.frase,
                  veredito: juizo.veredito,
                  tom: juizo.tom,
                };
              }),
          };
        })}
      />
    </div>
  );
}

type Tom = "bom" | "atencao" | "ruim" | "neutro";


const COR: Record<Trabalho, { barra: string; fundo: string; texto: string }> = {
  visto: { barra: "bg-trabalho-visto", fundo: "bg-trabalho-visto-soft", texto: "text-trabalho-visto" },
  whatsapp: { barra: "bg-trabalho-conversa", fundo: "bg-trabalho-conversa-soft", texto: "text-trabalho-conversa" },
  cliente: { barra: "bg-accent", fundo: "bg-accent/10", texto: "text-accent" },
  loja: { barra: "bg-trabalho-loja", fundo: "bg-trabalho-loja-soft", texto: "text-trabalho-loja" },
};

const PLATAFORMA: Record<string, string> = { GOOGLE: "Google", META: "Facebook e Instagram", TIKTOK: "TikTok" };
const STATUS: Record<string, string> = { ACTIVE: "ativa", PAUSED: "pausada", ARCHIVED: "arquivada", DELETED: "excluída" };

interface Item {
  atual: DesempenhoDeCampanha;
  locais?: { ligacoes: number | null; rotas: number | null };
}

function soma(itens: Item[], valor: (item: Item) => number | null | undefined): number | null {
  const conhecidos = itens.map(valor).filter((v): v is number => typeof v === "number");
  return conhecidos.length ? conhecidos.reduce((a, b) => a + b, 0) : null;
}

function clientesDe(atual: DesempenhoDeCampanha): number {
  return atual.clientes ?? atual.vendas;
}

function resumoDoTrabalho(trabalho: Trabalho, itens: Item[], medido: boolean): string {
  if (trabalho === "visto") {
    const views = soma(itens, (i) => i.atual.visualizacoesDeVideo);
    const impressoes = soma(itens, (i) => i.atual.impressoes);
    if (views && views > 0) return `${inteiro(views)} visualizações de vídeo${impressoes ? `, em ${inteiro(impressoes)} exibições` : ""}`;
    return impressoes ? `Os anúncios apareceram ${inteiro(impressoes)} vezes` : "Sem número de entrega no período";
  }
  if (trabalho === "whatsapp") {
    const conversas = soma(itens, (i) => i.atual.conversasNaPlataforma);
    const leads = itens.reduce((s, i) => s + i.atual.leads, 0);
    if (conversas !== null) {
      return `${contagem(conversas, "conversa aberta", "conversas abertas")}${medido ? `, ${contagem(leads, "virou lead", "viraram lead")} aqui` : ""}`;
    }
    const cliques = soma(itens, (i) => i.atual.cliques);
    return cliques !== null ? `${contagem(cliques, "clique", "cliques")} no anúncio` : "Sem número de cliques no período";
  }
  if (trabalho === "loja") {
    const ligacoes = soma(itens, (i) => i.locais?.ligacoes);
    const rotas = soma(itens, (i) => i.locais?.rotas);
    return `${contagem(ligacoes ?? 0, "ligação", "ligações")} e ${contagem(rotas ?? 0, "pedido de rota", "pedidos de rota")}`;
  }
  const leads = itens.reduce((s, i) => s + i.atual.leads, 0);
  const clientes = itens.reduce((s, i) => s + clientesDe(i.atual), 0);
  return medido ? `${contagem(leads, "contato", "contatos")} e ${contagem(clientes, "cliente", "clientes")}` : "Contatos aparecem com o WhatsApp recebendo";
}

interface Referencias {
  porVisualizacao: number | null;
  porConversa: number | null;
  porCliente: number | null;
}

/** A média do mesmo trabalho, que é contra o que cada campanha é comparada. */
function referencias(linhas: { trabalho: Trabalho; atual: DesempenhoDeCampanha }[]): Referencias {
  const media = (itens: { gasto: number; quantidade?: number | null }[]) => {
    const validos = itens.filter((i) => i.quantidade && i.quantidade > 0 && i.gasto > 0);
    const gasto = validos.reduce((s, i) => s + i.gasto, 0);
    const quantidade = validos.reduce((s, i) => s + (i.quantidade ?? 0), 0);
    return quantidade > 0 ? gasto / quantidade : null;
  };
  return {
    porVisualizacao: media(
      linhas.filter((l) => l.trabalho === "visto").map((l) => ({ gasto: l.atual.gastoCentavos, quantidade: l.atual.visualizacoesDeVideo })),
    ),
    porConversa: media(
      linhas.filter((l) => l.trabalho === "whatsapp").map((l) => ({ gasto: l.atual.gastoCentavos, quantidade: l.atual.conversasNaPlataforma })),
    ),
    porCliente: media(
      linhas.filter((l) => l.trabalho === "cliente").map((l) => ({ gasto: l.atual.gastoCentavos, quantidade: clientesDe(l.atual) })),
    ),
  };
}

/** Mais de 30% acima da média do mesmo trabalho é "mais caro". */
const FOLGA = 1.3;

function julga(
  trabalho: Trabalho,
  atual: DesempenhoDeCampanha,
  locais: Item["locais"],
  ref: Referencias,
  medido: boolean,
): { frase: string; veredito: string | null; tom: Tom } {
  const gasto = atual.gastoCentavos;

  if (trabalho === "visto") {
    const views = atual.visualizacoesDeVideo;
    if (views && views > 0) {
      const custo = gasto / views;
      const caro = ref.porVisualizacao !== null && custo > ref.porVisualizacao * FOLGA;
      return {
        frase: `${inteiro(views)} visualizações de vídeo, a ${centavosLegiveis(custo)} cada.`,
        veredito: caro ? "Mais caro que os outros vídeos" : "Cumpriu o trabalho",
        tom: caro ? "atencao" : "bom",
      };
    }
    if (atual.impressoes && atual.impressoes > 0) {
      return {
        frase: `Apareceu ${inteiro(atual.impressoes)} vezes, a ${reaisCentavos((gasto / atual.impressoes) * 1000)} por mil exibições.`,
        veredito: "Cumpriu o trabalho",
        tom: "bom",
      };
    }
    return { frase: "A plataforma ainda não mandou quantas pessoas viram.", veredito: null, tom: "neutro" };
  }

  if (trabalho === "whatsapp") {
    const conversas = atual.conversasNaPlataforma;
    if (conversas !== null && conversas > 0) {
      const leads = atual.leads;
      const caro = ref.porConversa !== null && gasto / conversas > ref.porConversa * FOLGA;
      if (medido && leads === 0) {
        return {
          frase: `${contagem(conversas, "conversa aberta", "conversas abertas")}, mas nenhuma chegou como lead aqui. Vale conferir se o anúncio leva ao número conectado.`,
          veredito: "Conversas sem lead",
          tom: "atencao",
        };
      }
      return {
        frase: `${contagem(conversas, "conversa aberta", "conversas abertas")}, a ${reais(gasto / conversas)} cada${medido ? `; ${contagem(leads, "virou lead", "viraram lead")} aqui` : ""}.`,
        veredito: caro ? "Conversa mais cara" : "Trazendo conversas",
        tom: caro ? "atencao" : "bom",
      };
    }
    const cliques = atual.cliques;
    if (cliques && cliques > 0) {
      return {
        frase: `${contagem(cliques, "clique", "cliques")}, a ${reaisCentavos(gasto / cliques)} cada${medido ? `; ${contagem(atual.leads, "virou lead", "viraram lead")} aqui` : ""}.`,
        veredito: medido && atual.leads > 0 ? "Trazendo conversas" : "Cliques sem conversa",
        tom: medido && atual.leads > 0 ? "bom" : "neutro",
      };
    }
    return gasto > 0
      ? { frase: `${reais(gasto)} gastos sem clique nem conversa registrados.`, veredito: "Sem resultado", tom: "ruim" }
      : { frase: "Sem gasto no período.", veredito: null, tom: "neutro" };
  }

  if (trabalho === "loja") {
    const ligacoes = locais?.ligacoes ?? 0;
    const rotas = locais?.rotas ?? 0;
    const acoes = ligacoes + rotas;
    return acoes > 0
      ? {
          frase: `${contagem(ligacoes, "ligação", "ligações")} e ${contagem(rotas, "pedido de rota", "pedidos de rota")}, a ${reais(gasto / acoes)} cada.`,
          veredito: "Trazendo gente",
          tom: "bom",
        }
      : { frase: "Nenhuma ligação ou pedido de rota no período.", veredito: gasto > 0 ? "Sem resultado" : null, tom: gasto > 0 ? "ruim" : "neutro" };
  }

  // Trazer cliente.
  if (!medido) {
    return { frase: `${contagem(atual.cliques ?? 0, "clique", "cliques")} no anúncio.`, veredito: null, tom: "neutro" };
  }
  const clientes = clientesDe(atual);
  if (gasto > 0 && atual.leads === 0) {
    return { frase: `${reais(gasto)} gastos sem nenhum contato. Vale revisar o anúncio com quem cuida do tráfego.`, veredito: "Gastando sem retorno", tom: "ruim" };
  }
  if (clientes > 0) {
    const custo = gasto / clientes;
    const caro = ref.porCliente !== null && gasto > 0 && custo > ref.porCliente * FOLGA;
    return {
      frase: `${contagem(atual.leads, "contato", "contatos")}, ${contagem(clientes, "virou cliente", "viraram clientes")}.${gasto > 0 ? ` Cada cliente custou ${reais(custo)}.` : ""}`,
      veredito: caro ? "Cliente mais caro" : "Trazendo clientes",
      tom: caro ? "atencao" : "bom",
    };
  }
  return { frase: `${contagem(atual.leads, "contato", "contatos")}, nenhum virou cliente ainda.`, veredito: "Contatos, sem cliente ainda", tom: "neutro" };
}

function contagem(n: number, um: string, varios: string): string {
  return `${inteiro(n)} ${n === 1 ? um : varios}`;
}

function inteiro(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

/** Reais sem centavos: num resumo, "R$ 1.200" lê mais rápido que "R$ 1.200,00". */
function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(centavos / 100);
}

function reaisCentavos(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100);
}

/** Custo de um centavo para baixo: "R$ 0,02" e não "R$ 0". */
function centavosLegiveis(centavos: number): string {
  return centavos < 100 ? reaisCentavos(centavos) : reais(centavos);
}

/**
 * O que conta como "o que voltou" em cada trabalho, com uma unidade só por
 * grupo: barras de visualização e de exibição lado a lado mentiriam na escala.
 */
function unidadeDoTrabalho(
  trabalho: Trabalho,
  atuais: DesempenhoDeCampanha[],
): { nome: [string, string]; valor: (atual: DesempenhoDeCampanha, locais?: Item["locais"]) => number | null } {
  if (trabalho === "visto") {
    return atuais.some((a) => (a.visualizacoesDeVideo ?? 0) > 0)
      ? { nome: ["visualização", "visualizações"], valor: (a) => a.visualizacoesDeVideo ?? null }
      : { nome: ["exibição", "exibições"], valor: (a) => a.impressoes ?? null };
  }
  if (trabalho === "whatsapp") {
    return atuais.some((a) => a.conversasNaPlataforma !== null)
      ? { nome: ["conversa", "conversas"], valor: (a) => a.conversasNaPlataforma ?? null }
      : { nome: ["clique", "cliques"], valor: (a) => a.cliques ?? null };
  }
  if (trabalho === "loja") {
    return {
      nome: ["pessoa", "pessoas"],
      valor: (_a, locais) => (locais ? (locais.ligacoes ?? 0) + (locais.rotas ?? 0) : null),
    };
  }
  return { nome: ["contato", "contatos"], valor: (a) => a.leads };
}
