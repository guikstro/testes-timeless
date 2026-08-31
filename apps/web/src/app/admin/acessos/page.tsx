import { apiFetch } from "@/lib/api-client";

interface ImpersonationEntry {
  id: string;
  createdAt: string;
  user: { name: string; email: string } | null;
  organization: { name: string } | null;
}

interface Paginated<T> {
  items: T[];
  total: number;
}

/**
 * Histórico de entradas em clientes. Existe para o operador poder auditar a
 * si mesmo: um acesso a dados de cliente que ninguém consegue revisar depois
 * é, na prática, um acesso sem controle.
 */
export default async function ImpersonationLogPage() {
  const data = await apiFetch<Paginated<ImpersonationEntry>>("/admin/impersonations?limit=50");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Acessos a clientes</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Toda vez que um operador entra em um cliente, o acesso é registrado aqui, sem exceção.
      </p>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          Nenhum acesso registrado ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Operador</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(entry.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {entry.user?.name ?? "Operador removido"}
                    <span className="block text-xs text-slate-400">{entry.user?.email}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{entry.organization?.name ?? "Organização removida"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
