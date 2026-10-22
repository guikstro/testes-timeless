import Link from "next/link";
import type { CampanhaComparada, DesempenhoDeCampanha, DesempenhoDeCampanhas } from "./tipos";

/**
 * A parte de cima de Campanhas, para quem não entende de tráfego.
 *
 * Uma frase com o que o dinheiro trouxe e uma ficha por campanha, da melhor
 * para a pior, cada uma com um veredito em português. As métricas da
 * plataforma (impressão, clique, CTR) continuam na tabela, logo abaixo, para
 * quem cuida dos anúncios.
 */
export function CampanhasSimples({ dados, medido }: { dados: DesempenhoDeCampanhas; medido: boolean }) {
  const { totais } = dados;
  const clientesTotais = totais.clientes ?? totais.vendas;
  const custoMedio = clientesTotais > 0 ? totais.gastoCentavos / clientesTotais : null;

  const ativas = dados.campanhas
    .filter((linha): linha is CampanhaComparada & { atual: DesempenhoDeCampanha } => linha.atual !== null)
    .sort((a, b) => compara(a.atual, b.atual));

  // Sem gasto nenhum, "R$ 0 investidos, 0 contatos" parece defeito. O que
  // falta é ligar a conta de anúncios, e a tela diz isso.
  if (dados.campanhas.length === 0 && totais.gastoCentavos === 0) {
    return (
      <section className="mb-8 rounded-2xl border border-line/70 bg-panel px-6 py-10 text-center shadow-card">
        <p className="font-display text-xl font-semibold tracking-tight text-ink">Nenhum anúncio neste período</p>
        <p className="mx-auto mt-2 max-w-md text-corpo text-ink-soft">
          Conecte a conta de anúncios para ver quanto cada campanha custou e quantos clientes trouxe.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/integrations/meta" className="focus-ring rounded-full bg-ink px-4 py-2 text-corpo font-medium text-canvas">
            Conectar Facebook/Instagram
          </Link>
          <Link href="/integrations/google" className="focus-ring rounded-full border border-line px-4 py-2 text-corpo font-medium text-ink-soft hover:text-ink">
            Conectar Google
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="mb-8">
      <section className="py-6 text-center sm:py-8">
        <p className="font-display text-5xl font-semibold tracking-[-0.035em] text-ink sm:text-6xl">
          {reais(totais.gastoCentavos)}
        </p>
        <p className="mt-3 text-lg text-ink">
          investidos
          {medido ? (
            <>
              , que trouxeram <span className="font-semibold">{contagem(totais.leads, "contato", "contatos")}</span> e{" "}
              <span className="font-semibold text-accent">{contagem(clientesTotais, "cliente", "clientes")}</span>
            </>
          ) : null}
        </p>
        {medido && custoMedio !== null ? (
          <p className="mt-1 text-corpo text-ink-mute">Em média, cada cliente custou {reais(custoMedio)}.</p>
        ) : null}
        <p className="mt-1 text-apoio text-ink-mute">Cliente é quem marcou reunião ou fechou contrato.</p>
      </section>

      {ativas.length > 0 ? (
        <>
          <h2 className="mb-3 text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
            Suas campanhas, da melhor para a pior
          </h2>
          <ul className="space-y-3">
            {ativas.map((linha) => (
              <Ficha key={linha.externalId} linha={linha} atual={linha.atual} custoMedio={custoMedio} medido={medido} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Mais clientes primeiro; empate, o cliente mais barato; depois quem trouxe mais contato com menos gasto. */
function compara(a: DesempenhoDeCampanha, b: DesempenhoDeCampanha): number {
  const ca = clientesDe(a);
  const cb = clientesDe(b);
  if (ca !== cb) return cb - ca;
  if (ca > 0) return a.gastoCentavos / ca - b.gastoCentavos / cb;
  if (a.leads !== b.leads) return b.leads - a.leads;
  return a.gastoCentavos - b.gastoCentavos;
}

function clientesDe(linha: DesempenhoDeCampanha): number {
  return linha.clientes ?? linha.vendas;
}

type Tom = "bom" | "atencao" | "ruim" | "neutro";

function veredito(atual: DesempenhoDeCampanha, custoMedio: number | null): { rotulo: string; tom: Tom; dica?: string } {
  const clientes = clientesDe(atual);
  if (atual.gastoCentavos > 0 && atual.leads === 0) {
    return {
      rotulo: "Gastando sem retorno",
      tom: "ruim",
      dica: `${reais(atual.gastoCentavos)} gastos sem nenhum contato. Vale revisar o anúncio com quem cuida do tráfego.`,
    };
  }
  if (clientes > 0) {
    const custo = atual.gastoCentavos / clientes;
    if (custoMedio === null || atual.gastoCentavos === 0 || custo <= custoMedio * 1.1) {
      return { rotulo: "Trazendo clientes", tom: "bom" };
    }
    return { rotulo: "Cliente mais caro", tom: "atencao" };
  }
  if (atual.leads > 0) return { rotulo: "Contatos, sem cliente ainda", tom: "neutro" };
  return { rotulo: "Sem gasto no período", tom: "neutro" };
}

const TOM: Record<Tom, { selo: string; borda: string }> = {
  bom: { selo: "bg-success-soft text-success", borda: "border-success-line" },
  atencao: { selo: "bg-warning-soft text-warning", borda: "border-line/70" },
  ruim: { selo: "bg-danger-soft text-danger", borda: "border-danger-line" },
  neutro: { selo: "bg-panel-soft text-ink-soft", borda: "border-line/70" },
};

const PLATAFORMA: Record<string, string> = { GOOGLE: "Google", META: "Facebook/Instagram" };
const STATUS: Record<string, string> = { ACTIVE: "ativa", PAUSED: "pausada", ARCHIVED: "arquivada", DELETED: "excluída" };

function Ficha({
  linha,
  atual,
  custoMedio,
  medido,
}: {
  linha: CampanhaComparada;
  atual: DesempenhoDeCampanha;
  custoMedio: number | null;
  medido: boolean;
}) {
  const clientes = clientesDe(atual);
  const { rotulo, tom, dica } = medido ? veredito(atual, custoMedio) : { rotulo: "", tom: "neutro" as Tom, dica: undefined };
  const estilo = TOM[tom];

  return (
    <li className={`rounded-2xl border bg-panel p-5 shadow-card ${estilo.borda}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-destaque font-semibold text-ink">{linha.nome}</p>
          <p className="text-apoio text-ink-mute">
            {PLATAFORMA[linha.plataforma] ?? linha.plataforma}
            {STATUS[linha.status] ? ` · ${STATUS[linha.status]}` : ""}
          </p>
        </div>
        {rotulo ? (
          <span className={`shrink-0 rounded-full px-3 py-1 text-apoio font-medium ${estilo.selo}`}>{rotulo}</span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero rotulo="investido" valor={reais(atual.gastoCentavos)} />
        {medido ? (
          <>
            <Numero rotulo="contatos" valor={String(atual.leads)} />
            <Numero rotulo="clientes" valor={String(clientes)} destaque={clientes > 0} />
            <Numero rotulo="por cliente" valor={clientes > 0 && atual.gastoCentavos > 0 ? reais(atual.gastoCentavos / clientes) : "—"} />
          </>
        ) : null}
      </dl>

      {dica ? <p className="mt-4 border-t border-line/60 pt-3 text-corpo text-ink-soft">{dica}</p> : null}
    </li>
  );
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <dd className={`font-display text-xl font-semibold tracking-tight ${destaque ? "text-accent" : "text-ink"}`}>{valor}</dd>
      <dt className="text-apoio text-ink-mute">{rotulo}</dt>
    </div>
  );
}

function contagem(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Reais sem centavos: numa tela de resumo, "R$ 1.200" lê mais rápido que "R$ 1.200,00". */
function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    centavos / 100,
  );
}
