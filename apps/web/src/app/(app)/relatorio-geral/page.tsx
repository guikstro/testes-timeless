import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { CorDoCliente } from "../clientes/cor-do-cliente";

interface Cliente {
  id: string;
  name: string;
  brandColor: string | null;
  whatsappConnection: { status: string } | null;
  leadCount: number;
  saleCount: number;
  revenueCents: number;
}

/**
 * O relatório da equipe Timeless: todos os clientes somados e lado a lado.
 * Os números são de todo o histórico de cada cliente.
 */
export default async function RelatorioGeralPage() {
  let clientes: Cliente[];
  try {
    clientes = (await apiFetch<{ items: Cliente[] }>("/admin/organizations?limit=100")).items;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return (
        <div className="max-w-lg rounded-xl border border-line bg-panel p-6 text-corpo text-ink-soft">
          <h1 className="mb-2 font-display text-xl font-semibold text-ink">Relatório geral</h1>
          {error.body.message}
        </div>
      );
    }
    throw error;
  }

  const porReceita = [...clientes].sort((a, b) => b.revenueCents - a.revenueCents || b.leadCount - a.leadCount);
  const total = {
    leads: clientes.reduce((soma, c) => soma + c.leadCount, 0),
    vendas: clientes.reduce((soma, c) => soma + c.saleCount, 0),
    receita: clientes.reduce((soma, c) => soma + c.revenueCents, 0),
    conectados: clientes.filter((c) => c.whatsappConnection?.status === "CONNECTED").length,
  };

  const cartoes = [
    { rotulo: "Clientes", valor: String(clientes.length) },
    { rotulo: "WhatsApp conectado", valor: `${total.conectados} de ${clientes.length}` },
    { rotulo: "Leads", valor: String(total.leads) },
    { rotulo: "Vendas", valor: String(total.vendas) },
    { rotulo: "Receita", valor: formatCentsAsBRL(total.receita) },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Relatório geral</h1>
      <p className="mt-1 text-corpo text-ink-mute">Todos os clientes, desde o início de cada um.</p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cartoes.map((cartao) => (
          <div key={cartao.rotulo} className="rounded-xl border border-line bg-panel p-4">
            <dt className="text-apoio font-medium uppercase tracking-wide text-ink-mute">{cartao.rotulo}</dt>
            <dd className="mt-1 font-display text-xl font-semibold text-ink">{cartao.valor}</dd>
          </div>
        ))}
      </dl>

      {porReceita.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-panel p-10 text-center text-corpo text-ink-soft">
          Nenhum cliente ainda.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-corpo">
            <thead className="border-b border-line text-apoio uppercase tracking-wide text-ink-mute">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 text-right font-medium">Leads</th>
                <th className="px-4 py-3 text-right font-medium">Vendas</th>
                <th className="px-4 py-3 text-right font-medium">Conversão</th>
                <th className="px-4 py-3 text-right font-medium">Receita</th>
              </tr>
            </thead>
            <tbody>
              {porReceita.map((cliente) => (
                <tr key={cliente.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${cliente.id}`} className="focus-ring flex items-center gap-2 rounded font-medium text-ink hover:underline">
                      <CorDoCliente cor={cliente.brandColor} />
                      {cliente.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft">{cliente.leadCount}</td>
                  <td className="px-4 py-3 text-right text-ink-soft">{cliente.saleCount}</td>
                  <td className="px-4 py-3 text-right text-ink-soft">
                    {cliente.leadCount ? `${Math.round((cliente.saleCount / cliente.leadCount) * 100)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{formatCentsAsBRL(cliente.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
