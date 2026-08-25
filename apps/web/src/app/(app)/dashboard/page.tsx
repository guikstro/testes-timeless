export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="mb-4 text-sm font-medium text-slate-700">
          Ainda não há dados suficientes para calcular métricas.
        </p>
        <ul className="mx-auto max-w-sm space-y-2 text-left text-sm text-slate-600">
          <li>1. Conecte seu WhatsApp</li>
          <li>2. Conecte sua conta Meta Ads</li>
          <li>3. Crie um link rastreável</li>
        </ul>
      </div>
    </div>
  );
}
