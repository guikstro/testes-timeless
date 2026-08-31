import { apiFetch } from "@/lib/api-client";
import { CreateLinkForm } from "./create-link-form";

interface TrackingLinkListItem {
  id: string;
  name: string;
  code: string;
  destinationUrl: string;
  createdAt: string;
  _count: { clicks: number };
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

const PUBLIC_TRACKING_BASE_URL = process.env.PUBLIC_TRACKING_BASE_URL ?? "http://localhost:3001";

export default async function LinksPage() {
  const { items } = await apiFetch<PaginatedResult<TrackingLinkListItem>>("/tracking-links?limit=50");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Links rastreáveis</h1>

      <CreateLinkForm />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center text-sm text-ink-soft">
          Nenhum link criado ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-mute">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Link</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium">Cliques</th>
                <th className="px-4 py-3 font-medium">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-ink">{item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                    {PUBLIC_TRACKING_BASE_URL}/r/{item.code}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-ink-mute">{item.destinationUrl}</td>
                  <td className="px-4 py-3 text-ink">{item._count.clicks}</td>
                  <td className="px-4 py-3 text-ink-mute">
                    {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
