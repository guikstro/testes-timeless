import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/skeleton";
import { LeadBoard } from "./lead-board";
import { LeadCartao } from "./lead-card";
import { LeadsFilters } from "./leads-filters";

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

const PAGINA = 200;


export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const pagina = Math.max(1, Number(params.page ?? "1") || 1);

  const consulta = new URLSearchParams({ limit: String(PAGINA), offset: String((pagina - 1) * PAGINA) });
  if (params.search) consulta.set("search", params.search);
  if (params.status) consulta.set("status", params.status);

  const { items, total } = await apiFetch<PaginatedResult<LeadCartao>>(`/leads?${consulta.toString()}`);
  const ultimaPagina = Math.max(1, Math.ceil(total / PAGINA));
  const filtrando = Boolean(params.search || params.status);

  function linkPagina(destino: number) {
    const novos = new URLSearchParams();
    if (params.search) novos.set("search", params.search);
    if (params.status) novos.set("status", params.status);
    if (destino > 1) novos.set("page", String(destino));
    const query = novos.toString();
    return query ? `/leads?${query}` : "/leads";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Leads</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">Cada conversa que chegou pelo WhatsApp, com a origem provada.</p>

      <LeadsFilters total={total} />

      {items.length === 0 ? (
        <div className="surface">
          <EmptyState
            title={filtrando ? "Nenhum lead com esses filtros" : "Nenhum lead ainda"}
            description={
              filtrando
                ? "Tente outro termo, ou limpe os filtros para ver a lista inteira."
                : "Conecte o WhatsApp em Integrações e os leads aparecem aqui assim que a primeira mensagem chegar."
            }
            action={
              filtrando ? (
                <Link
                  href="/leads"
                  className="focus-ring inline-flex h-10 items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ink transition-all duration-200 hover:border-ink/25"
                >
                  Limpar filtros
                </Link>
              ) : (
                <Link
                  href="/integrations/whatsapp"
                  className="focus-ring inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-canvas transition-all duration-200 hover:shadow-card active:scale-[0.97]"
                >
                  Conectar WhatsApp
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <LeadBoard leads={items} />

          {ultimaPagina > 1 ? (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-[13px] text-ink-mute">
                Página {pagina} de {ultimaPagina}
              </p>
              <div className="flex gap-2">
                {pagina > 1 ? (
                  <Link
                    href={linkPagina(pagina - 1)}
                    className="focus-ring inline-flex h-9 items-center rounded-full border border-line bg-panel px-4 text-[13px] font-medium text-ink transition-all duration-200 hover:border-ink/25 active:scale-95"
                  >
                    Anterior
                  </Link>
                ) : null}
                {pagina < ultimaPagina ? (
                  <Link
                    href={linkPagina(pagina + 1)}
                    className="focus-ring inline-flex h-9 items-center rounded-full border border-line bg-panel px-4 text-[13px] font-medium text-ink transition-all duration-200 hover:border-ink/25 active:scale-95"
                  >
                    Próxima
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
