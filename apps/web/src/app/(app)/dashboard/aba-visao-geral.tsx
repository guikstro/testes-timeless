import { Hero } from "./hero";
import { LeadsAreaChart } from "./leads-area-chart";
import { EmptyState } from "@/components/ui/skeleton";
import { formatCentsAsBRL } from "@/lib/currency";
import type { Overview } from "./tipos";
import { formatRate, plural } from "./tipos";

/**
 * A pergunta desta aba é uma só: quanto entrou, e melhorou?
 *
 * Por isso ela tem duas coisas, não oito. O número grande responde "quanto",
 * a curva responde "como chegou aqui", e nada mais divide a atenção.
 */
export function AbaVisaoGeral({ overview }: { overview: Overview }) {
  const { totals, comparacao, daily } = overview;

  return (
    <div className="space-y-5">
      <Hero
        leads={totals.leads}
        deltaLeads={comparacao.leads.delta}
        receitaCentavos={totals.revenueCents}
        deltaReceita={comparacao.revenueCents.delta}
        secundarios={[
          {
            rotulo: "Aproveitáveis",
            valor: String(totals.workable),
            nota: totals.disqualified > 0 ? plural(totals.disqualified, "descartado", "descartados") : undefined,
          },
          { rotulo: "Qualificação", valor: formatRate(totals.qualificationRate) },
          { rotulo: "Fechamento", valor: formatRate(totals.closeRate) },
          {
            rotulo: "Ticket médio",
            valor: totals.won > 0 ? formatCentsAsBRL(Math.round(totals.revenueCents / totals.won)) : "Sem base",
          },
        ]}
      />

      <section className="surface p-6">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Leads e vendas por dia</h2>
        <p className="mb-5 mt-0.5 text-apoio text-ink-mute">Passe o mouse para ver um dia específico</p>

        {totals.leads > 0 ? (
          <LeadsAreaChart data={daily} />
        ) : (
          <EmptyState
            title="Nenhum lead neste período"
            description="Quando alguém mandar a primeira mensagem, ela aparece aqui no mesmo dia."
          />
        )}
      </section>
    </div>
  );
}
