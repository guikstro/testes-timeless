import Link from "next/link";

export default function IntegrationsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Integrações</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/integrations/whatsapp"
          className="rounded-xl border border-line bg-panel p-6 hover:border-line"
        >
          <p className="font-medium text-ink">WhatsApp</p>
          <p className="mt-1 text-sm text-ink-mute">Conecte um número do WhatsApp Business para capturar leads.</p>
        </Link>

        <Link
          href="/integrations/meta"
          className="rounded-xl border border-line bg-panel p-6 hover:border-line"
        >
          <p className="font-medium text-ink">Meta Ads</p>
          <p className="mt-1 text-sm text-ink-mute">Sincronize campanhas, conjuntos, anúncios e investimento.</p>
        </Link>
      </div>
    </div>
  );
}
