"use client";

import { useState } from "react";
import { formatCentsAsBRL } from "@/lib/currency";

interface Origem {
  key: string;
  label: string;
  leads: number;
  qualified: number;
  meetings: number;
  won: number;
  revenueCents: number;
}

type Criterio = "leads" | "won" | "taxa" | "receita";

/**
 * Comparação entre origens.
 *
 * A tabela anterior ordenava só por volume, e volume esconde qualidade: a
 * origem que traz mais gente frequentemente não é a que fecha melhor. Ordenar
 * por taxa de fechamento é o que revela isso, e por isso a ordenação virou
 * escolha de quem lê em vez de decisão minha.
 */
export function OriginTable({ origens }: { origens: Origem[] }) {
  const [criterio, setCriterio] = useState<Criterio>("leads");

  const taxa = (o: Origem) => (o.leads > 0 ? o.won / o.leads : 0);

  const ordenadas = [...origens].sort((a, b) => {
    // A origem desconhecida fica sempre por último: ela é o resíduo do que não
    // deu para provar, não um canal que possa ser comparado com os outros.
    if (a.key === "unknown") return 1;
    if (b.key === "unknown") return -1;
    if (criterio === "won") return b.won - a.won;
    if (criterio === "receita") return b.revenueCents - a.revenueCents;
    if (criterio === "taxa") return taxa(b) - taxa(a);
    return b.leads - a.leads;
  });

  const melhorTaxa = Math.max(...origens.filter((o) => o.key !== "unknown" && o.leads >= 5).map(taxa), 0);

  const colunas: { chave: Criterio; rotulo: string }[] = [
    { chave: "leads", rotulo: "Leads" },
    { chave: "won", rotulo: "Vendas" },
    { chave: "taxa", rotulo: "Fecha" },
    { chave: "receita", rotulo: "Receita" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line/70">
            <th className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">Origem</th>
            {colunas.map((coluna) => (
              <th key={coluna.chave} className="py-2 pr-3 text-right">
                <button
                  type="button"
                  onClick={() => setCriterio(coluna.chave)}
                  aria-pressed={criterio === coluna.chave}
                  className={`focus-ring rounded px-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    criterio === coluna.chave ? "text-accent" : "text-ink-mute hover:text-ink"
                  }`}
                >
                  {coluna.rotulo}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((origem) => {
            const t = taxa(origem);
            // Só destaca a melhor quando há amostra suficiente: uma origem com
            // dois leads e uma venda daria 50% e lideraria sem significar nada.
            const destaque = origem.key !== "unknown" && origem.leads >= 5 && t === melhorTaxa && t > 0;

            return (
              <tr
                key={origem.key}
                className="group border-b border-line/40 transition-colors last:border-0 hover:bg-ink/[0.025]"
              >
                <td className="py-2.5 pr-4">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-ink-soft">{origem.label}</span>
                    {destaque ? (
                      <span className="shrink-0 rounded-full bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        melhor taxa
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">{origem.leads}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">{origem.won}</td>
                <td className="py-2.5 pr-3 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-panel-soft sm:block">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, t * 100 * 2.5)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right tabular-nums text-ink-soft">
                      {origem.leads > 0 ? `${Math.round(t * 100)}%` : ""}
                    </span>
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-soft">
                  {origem.revenueCents > 0 ? formatCentsAsBRL(origem.revenueCents) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
