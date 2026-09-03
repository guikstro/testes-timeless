import { EmptyState } from "@/components/ui/skeleton";
import { FluxoDoFunil } from "./fluxo-do-funil";
import { StatCard } from "./stat-card";
import type { Overview } from "./tipos";
import { formatRate } from "./tipos";

/**
 * Onde as pessoas somem.
 *
 * O fluxo mostra as saídas, e não só os sobreviventes. Abaixo dele, a maior
 * perda vem escrita numa frase: um gráfico que exige medir com o olho para
 * saber qual etapa é o problema não terminou o trabalho.
 */
export function AbaFunil({ overview }: { overview: Overview }) {
  const { totals, comparacao, daily } = overview;

  const etapas = [
    { chave: "leads", rotulo: "Chegaram", valor: totals.leads, saida: "descartados ou sem resposta" },
    { chave: "qualificados", rotulo: "Qualificados", valor: totals.qualified, saida: "não avançaram" },
    { chave: "reunioes", rotulo: "Reuniões", valor: totals.meetings, saida: "não fecharam" },
    { chave: "vendas", rotulo: "Clientes", valor: totals.won },
  ];

  const maiorPerda = etapas.slice(0, -1).reduce<{ de: string; para: string; proporcao: number } | null>(
    (pior, etapa, i) => {
      const seguinte = etapas[i + 1];
      if (etapa.valor === 0) return pior;
      const proporcao = (etapa.valor - seguinte.valor) / etapa.valor;
      if (!pior || proporcao > pior.proporcao) {
        return { de: etapa.rotulo.toLowerCase(), para: seguinte.rotulo.toLowerCase(), proporcao };
      }
      return pior;
    },
    null,
  );

  return (
    <div className="space-y-5">
      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Para onde os leads vão</h2>
        <p className="mb-6 mt-0.5 text-apoio text-ink-mute">
          A faixa é quem seguiu. O que desce é quem saiu, e em que ponto.
        </p>

        {totals.leads > 0 ? (
          <>
            <FluxoDoFunil etapas={etapas} />

            {/* A conclusão escrita, para não depender de medir a faixa com o olho. */}
            {maiorPerda && maiorPerda.proporcao > 0 ? (
              <p className="mx-auto mt-6 max-w-2xl border-t border-line/60 pt-5 text-center text-corpo leading-relaxed text-ink-soft">
                A maior perda está entre <span className="font-semibold text-ink">{maiorPerda.de}</span> e{" "}
                <span className="font-semibold text-ink">{maiorPerda.para}</span>:{" "}
                <span className="font-semibold text-ink">{Math.round(maiorPerda.proporcao * 100)}%</span> das pessoas
                param aí.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="Ainda não há funil para mostrar"
            description="Ele aparece quando o primeiro lead chegar e começar a andar entre as etapas."
          />
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Qualificados"
          numero={totals.qualified}
          delta={comparacao.qualified.delta}
          anterior={comparacao.qualified.anterior}
          nota={`de ${totals.workable} aproveitáveis`}
        />
        <StatCard
          rotulo="Reuniões"
          numero={totals.meetings}
          delta={comparacao.meetings.delta}
          anterior={comparacao.meetings.anterior}
          nota={totals.qualified > 0 ? `${formatRate(totals.meetings / totals.qualified)} dos qualificados` : undefined}
        />
        <StatCard
          rotulo="Vendas"
          numero={totals.won}
          delta={comparacao.won.delta}
          anterior={comparacao.won.anterior}
          serie={daily.map((d) => d.won)}
          nota={`${formatRate(totals.closeRate)} dos qualificados`}
        />
      </div>
    </div>
  );
}
