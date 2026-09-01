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

/*
  100 é o teto que a API impõe, e ele existe para proteger o servidor de uma
  consulta sem limite. O quadro respeita esse teto e avisa quando há mais,
  em vez de eu afrouxar a guarda para caber o desenho.
*/
const PAGINA = 100;


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
  const filtrando = Boolean(params.search || params.status);


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

          {total > items.length ? (
            <p className="mt-4 text-center text-[12.5px] text-ink-mute">
              Mostrando os {items.length} leads com contato mais recente, de {total} no total. Use a busca ou os
              filtros para chegar nos outros.
            </p>
          ) : null}

        </>
      )}
    </div>
  );
}
