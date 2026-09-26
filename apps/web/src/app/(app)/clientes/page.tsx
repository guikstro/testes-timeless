import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { CorDoCliente } from "./cor-do-cliente";

interface Cliente {
  id: string;
  name: string;
  brandColor: string | null;
  whatsappConnection: { status: string } | null;
  leadCount: number;
}

const STATUS_DO_WHATSAPP: Record<string, { texto: string; cor: string }> = {
  CONNECTED: { texto: "Conectado", cor: "bg-emerald-500" },
  PENDING_QR: { texto: "Aguardando QR", cor: "bg-amber-500" },
};

/**
 * A lista de clientes da equipe Timeless. A API só responde a operadores da
 * plataforma (com verificação em duas etapas), e esta página mostra o motivo
 * quando recusa, em vez de uma tela de erro.
 */
export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca = "" } = await searchParams;

  let clientes: { items: Cliente[]; total: number };
  try {
    clientes = await apiFetch(`/admin/organizations?limit=100${busca ? `&search=${encodeURIComponent(busca)}` : ""}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return (
        <div className="max-w-lg rounded-xl border border-line bg-panel p-6 text-sm text-ink-soft">
          <h1 className="mb-2 font-display text-xl font-semibold text-ink">Clientes</h1>
          {error.body.message}
        </div>
      );
    }
    throw error;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Clientes</h1>
          <p className="mt-1 text-sm text-ink-mute">
            {clientes.total} {clientes.total === 1 ? "cliente" : "clientes"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex gap-2">
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Buscar por nome..."
              aria-label="Buscar cliente"
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </form>
          <Link
            href="/clientes/novo"
            className="focus-ring rounded-md bg-ink px-3 py-2 text-sm font-medium text-canvas hover:opacity-90"
          >
            + Novo cliente
          </Link>
        </div>
      </div>

      {clientes.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-10 text-center text-sm text-ink-soft">
          {busca ? `Nenhum cliente encontrado para "${busca}".` : "Nenhum cliente ainda. Comece em Novo cliente."}
        </div>
      ) : (
        <ul className="divide-y divide-line/70 rounded-xl border border-line bg-panel">
          <li className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-mute">
            Nome do cliente <span className="ml-1 rounded bg-panel-soft px-1.5 py-0.5">{clientes.total}</span>
          </li>
          {clientes.items.map((cliente) => {
            const status = STATUS_DO_WHATSAPP[cliente.whatsappConnection?.status ?? ""];
            return (
              <li key={cliente.id}>
                <Link
                  href={`/clientes/${cliente.id}`}
                  className="focus-ring flex items-center gap-3 px-4 py-3.5 hover:bg-panel-soft/80"
                >
                  <CorDoCliente cor={cliente.brandColor} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink underline decoration-line underline-offset-4">
                    {cliente.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-mute">
                    <span className={`inline-block h-2 w-2 rounded-full ${status?.cor ?? "bg-ink-mute/40"}`} aria-hidden />
                    WhatsApp: {status?.texto ?? "Desconectado"}
                  </span>
                  <span className="hidden w-20 text-right text-xs text-ink-mute sm:inline">
                    {cliente.leadCount} {cliente.leadCount === 1 ? "lead" : "leads"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
