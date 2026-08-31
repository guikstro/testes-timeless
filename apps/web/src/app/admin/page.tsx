import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { EnterClientButton } from "./enter-client-button";

interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  owner: { name: string; email: string } | null;
  leadCount: number;
  memberCount: number;
  saleCount: number;
  revenueCents: number;
  whatsappConnection: { provider: string; status: string; lastEventAt: string | null } | null;
  metaConnection: { status: string; lastSyncedAt: string | null } | null;
}

interface Paginated<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

const PAGE_SIZE = 20;

function connectionDot(ok: boolean) {
  return <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-line"}`} />;
}

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (search) query.set("search", search);

  const data = await apiFetch<Paginated<AdminOrganization>>(`/admin/organizations?${query.toString()}`);
  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Clientes</h1>
          <p className="mt-1 text-sm text-ink-mute">
            {data.total} {data.total === 1 ? "organização" : "organizações"}
          </p>
        </div>

        <form className="flex gap-2">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Buscar por nome..."
            className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink-soft hover:bg-panel-soft"
          >
            Buscar
          </button>
        </form>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-10 text-center text-sm text-ink-soft">
          {search ? `Nenhum cliente encontrado para "${search}".` : "Nenhum cliente cadastrado ainda."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-ink-mute">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Integrações</th>
                <th className="px-4 py-3 text-right font-medium">Leads</th>
                <th className="px-4 py-3 text-right font-medium">Vendas</th>
                <th className="px-4 py-3 text-right font-medium">Receita</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((organization) => (
                <tr key={organization.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{organization.name}</p>
                    <p className="text-xs text-ink-mute">
                      {organization.owner ? organization.owner.email : "sem responsável"}
                      {" · "}
                      {organization.memberCount} {organization.memberCount === 1 ? "usuário" : "usuários"}
                      {" · desde "}
                      {new Date(organization.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    <p>
                      {connectionDot(organization.whatsappConnection?.status === "CONNECTED")}
                      WhatsApp
                    </p>
                    <p className="mt-1">
                      {connectionDot(organization.metaConnection?.status === "CONNECTED")}
                      Meta Ads
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft">{organization.leadCount}</td>
                  <td className="px-4 py-3 text-right text-ink-soft">{organization.saleCount}</td>
                  <td className="px-4 py-3 text-right text-ink-soft">
                    {formatCentsAsBRL(organization.revenueCents)}
                  </td>
                  <td className="px-4 py-3">
                    <EnterClientButton organizationId={organization.id} organizationName={organization.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-mute">
            Página {page} de {lastPage}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/admin?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                className="rounded-md border border-line bg-panel px-3 py-1.5 text-ink-soft hover:bg-panel-soft"
              >
                Anterior
              </Link>
            ) : null}
            {page < lastPage ? (
              <Link
                href={`/admin?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                className="rounded-md border border-line bg-panel px-3 py-1.5 text-ink-soft hover:bg-panel-soft"
              >
                Próxima
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
