import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/skeleton";
import { ESTAGIOS } from "./estagios";
import { LeadBoard } from "./lead-board";
import { LeadCartao } from "./lead-card";
import { LeadsFilters } from "./leads-filters";

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/**
 * Teto por coluna, não pelo quadro inteiro.
 *
 * Antes o quadro pedia uma página só e a dividia em quatro, então uma coluna
 * cheia roubava espaço das outras: cem leads novos escondiam todas as vendas.
 * Cada coluna agora tem o seu orçamento, e o total de cada uma vem do próprio
 * servidor em vez de ser contado no que coube.
 */
const POR_COLUNA = 60;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; aguardando?: string }>;
}) {
  const params = await searchParams;
  const soAguardando = params.aguardando === "1";

  // Quatro consultas em paralelo, uma por coluna. São independentes, então
  // esperar uma pela outra só somaria latência.
  const colunas = await Promise.all(
    ESTAGIOS.map(async (estagio) => {
      const consulta = new URLSearchParams({ limit: String(POR_COLUNA), offset: "0", status: estagio });
      if (params.search) consulta.set("search", params.search);

      const { items, total } = await apiFetch<PaginatedResult<LeadCartao>>(`/leads?${consulta.toString()}`);
      return { estagio, itens: soAguardando ? items.filter((lead) => lead.awaitingReply) : items, total };
    }),
  );

  const totalGeral = colunas.reduce((soma, coluna) => soma + coluna.total, 0);
  const mostrados = colunas.reduce((soma, coluna) => soma + coluna.itens.length, 0);
  const filtrando = Boolean(params.search || soAguardando);

  return (
    <div className="mx-auto max-w-[100rem]">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Leads</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">Cada conversa que chegou pelo WhatsApp, com a origem provada.</p>

      <LeadsFilters total={totalGeral} />

      {mostrados === 0 ? (
        <div className="surface">
          <EmptyState
            title={filtrando ? "Nenhum lead com esses filtros" : "Nenhum lead ainda"}
            description={
              filtrando
                ? "Tente outro termo, ou limpe os filtros para ver o quadro inteiro."
                : "Conecte o WhatsApp em Integrações e os leads aparecem aqui assim que a primeira mensagem chegar."
            }
          />
        </div>
      ) : (
        <>
          <LeadBoard colunas={colunas} />

          {colunas.some((coluna) => coluna.total > coluna.itens.length) ? (
            <p className="mt-4 text-center text-apoio text-ink-mute">
              Cada coluna mostra até {POR_COLUNA} leads, do contato mais recente. Use a busca para chegar nos
              outros.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
