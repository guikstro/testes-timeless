import Link from "next/link";

export default function IntegrationsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Integrações</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/integrations/whatsapp"
          className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300"
        >
          <p className="font-medium text-slate-900">WhatsApp</p>
          <p className="mt-1 text-sm text-slate-500">Conecte um número do WhatsApp Business para capturar leads.</p>
        </Link>

        <Link
          href="/integrations/meta"
          className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300"
        >
          <p className="font-medium text-slate-900">Meta Ads</p>
          <p className="mt-1 text-sm text-slate-500">Sincronize campanhas, conjuntos, anúncios e investimento.</p>
        </Link>
      </div>
    </div>
  );
}
