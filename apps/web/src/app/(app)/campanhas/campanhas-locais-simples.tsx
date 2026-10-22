import { ListaDeCampanhas, TomDaCampanha } from "./lista-de-campanhas";

/**
 * A parte de cima de Campanhas para quem vive de presença local.
 *
 * O mesmo desenho da tela de leads: uma frase com o que o dinheiro trouxe e
 * cada campanha em português, julgada pelo trabalho dela, que aqui é trazer
 * gente à loja: ligação pelo anúncio e pedido de rota. A tabela com todas as
 * colunas continua logo abaixo, para quem cuida dos anúncios.
 */
export interface CampanhaLocal {
  externalId: string;
  nome: string;
  status: string;
  atual: {
    gastoCentavos: number;
    cliques: number;
    ligacoes: number | null;
    rotas: number | null;
  } | null;
}

/** Mais de 30% acima da média das outras campanhas é "mais cara". */
const FOLGA = 1.3;

const STATUS: Record<string, string> = { ACTIVE: "ativa", PAUSED: "pausada", ARCHIVED: "arquivada", DELETED: "excluída" };

export function CampanhasLocaisSimples({ campanhas }: { campanhas: CampanhaLocal[] }) {
  const linhas = campanhas
    .filter((linha): linha is CampanhaLocal & { atual: NonNullable<CampanhaLocal["atual"]> } => linha.atual !== null)
    .sort((a, b) => b.atual.gastoCentavos - a.atual.gastoCentavos);

  if (linhas.length === 0) {
    return <p className="mb-8 py-10 text-center text-destaque text-ink-mute">Nenhuma campanha com gasto neste período.</p>;
  }

  const gasto = linhas.reduce((soma, l) => soma + l.atual.gastoCentavos, 0);
  const medeLigacoes = linhas.some((l) => l.atual.ligacoes !== null);
  const medeRotas = linhas.some((l) => l.atual.rotas !== null);
  const ligacoes = linhas.reduce((soma, l) => soma + (l.atual.ligacoes ?? 0), 0);
  const rotas = linhas.reduce((soma, l) => soma + (l.atual.rotas ?? 0), 0);
  const acoes = ligacoes + rotas;
  const media = acoes > 0 ? gasto / acoes : null;

  const trouxe = [
    medeLigacoes ? contagem(ligacoes, "ligação", "ligações") : null,
    medeRotas ? contagem(rotas, "pedido de rota", "pedidos de rota") : null,
  ].filter(Boolean);

  return (
    <div className="mb-10">
      <section className="pb-8 pt-2">
        <p className="max-w-3xl font-display text-[1.6rem] font-medium leading-snug tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          Você investiu {reais(gasto)}
          {trouxe.length ? `, e as campanhas trouxeram ${trouxe.join(" e ")}.` : "."}
        </p>
        {media !== null ? (
          <p className="mt-3 text-destaque text-ink-soft">
            Em média, cada pessoa que ligou ou pediu o caminho custou {centavosLegiveis(media)}.
          </p>
        ) : null}
      </section>

      <ListaDeCampanhas
        grupos={[
          {
            chave: "loja",
            linhas: linhas.map(({ externalId, nome, status, atual }) => {
              const daCampanha = (atual.ligacoes ?? 0) + (atual.rotas ?? 0);
              const custo = daCampanha > 0 ? atual.gastoCentavos / daCampanha : null;
              const cara = custo !== null && media !== null && custo > media * FOLGA;
              const partes = [
                atual.ligacoes !== null ? contagem(atual.ligacoes, "ligação", "ligações") : null,
                atual.rotas !== null ? contagem(atual.rotas, "pedido de rota", "pedidos de rota") : null,
              ].filter(Boolean);
              const medido = atual.ligacoes !== null || atual.rotas !== null;
              return {
                id: externalId,
                nome,
                detalhe: `Google${STATUS[status] ? `, ${STATUS[status]}` : ""}`,
                gastoCentavos: atual.gastoCentavos,
                voltou: medido ? daCampanha : null,
                unidade: ["pessoa", "pessoas"] as [string, string],
                frase: partes.length
                  ? `${partes.join(" e ")}${custo !== null ? `, a ${centavosLegiveis(custo)} cada` : ""}. ${contagem(atual.cliques, "clique", "cliques")} no anúncio.`
                  : `${contagem(atual.cliques, "clique", "cliques")} no anúncio. Ligações e rotas ainda não estão sendo medidas.`,
                veredito: daCampanha > 0 ? (cara ? "Mais cara que as outras" : "Trazendo gente") : atual.gastoCentavos > 0 ? "Sem ligação nem rota" : null,
                tom: (daCampanha > 0 ? (cara ? "atencao" : "bom") : atual.gastoCentavos > 0 ? "ruim" : "neutro") as TomDaCampanha,
              };
            }),
          },
        ]}
      />
    </div>
  );
}

function contagem(n: number, um: string, varios: string): string {
  return `${new Intl.NumberFormat("pt-BR").format(n)} ${n === 1 ? um : varios}`;
}

function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(centavos / 100);
}

/** Abaixo de R$ 1 os centavos importam: "R$ 0,45" e não "R$ 0". */
function centavosLegiveis(centavos: number): string {
  return centavos < 100
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(centavos / 100)
    : reais(centavos);
}
