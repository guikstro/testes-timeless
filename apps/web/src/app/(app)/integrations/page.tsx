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

        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-400">
          <p className="font-medium">Meta Ads</p>
          <p className="mt-1 text-sm">Ainda não implementado (Fase 6).</p>
        </div>
      </div>
    </div>
  );
}
