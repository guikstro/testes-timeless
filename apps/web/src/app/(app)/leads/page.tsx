import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

interface LeadListItem {
  id: string;
  name: string | null;
  normalizedPhone: string;
  status: string;
  firstContactAt: string;
  lastContactAt: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export default async function LeadsPage() {
  const { items } = await apiFetch<PaginatedResult<LeadListItem>>("/leads?limit=50");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Leads</h1>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Nenhum lead ainda. Conecte o WhatsApp em Integrações para começar a capturar conversas.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Primeiro contato</th>
                <th className="px-4 py-3 font-medium">Último contato</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                      {lead.name ?? "Sem nome"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.normalizedPhone}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.status}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(lead.firstContactAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(lead.lastContactAt).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
