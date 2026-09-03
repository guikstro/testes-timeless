/**
 * O funil em barras, lido de cima para baixo.
 *
 * Já tentei aqui um funil em discos e um fluxo com ramificações. Os dois eram
 * bonitos e nenhum dos dois foi entendido sem explicação, o que num painel de
 * trabalho é o mesmo que não funcionar. Barra que encurta e uma frase dizendo
 * quantos saíram no meio do caminho não precisa de legenda.
 *
 * O comprimento é sempre proporcional à primeira etapa, e não à maior: assim
 * a última barra mostra de verdade o quanto sobrou de quem chegou.
 */
export interface EtapaDoFunil {
  chave: string;
  rotulo: string;
  valor: number;
  /** Como chamar quem não passou daqui para a etapa seguinte. */
  saida?: string;
}

export function FunilSimples({ etapas }: { etapas: EtapaDoFunil[] }) {
  const inicial = etapas[0]?.valor ?? 0;
  if (inicial === 0) return null;

  return (
    <ol className="space-y-1">
      {etapas.map((etapa, i) => {
        const proporcao = etapa.valor / inicial;
        const anterior = i > 0 ? etapas[i - 1] : null;
        const perda = anterior ? anterior.valor - etapa.valor : 0;
        const proporcaoDaPerda = anterior && anterior.valor > 0 ? perda / anterior.valor : 0;

        return (
          <li key={etapa.chave}>
            {/* A perda vem antes da etapa, no espaço entre as duas barras: é
                literalmente o que acontece no caminho de uma para a outra. */}
            {anterior && perda > 0 ? (
              <p className="flex items-center gap-2 py-2 pl-6 text-apoio text-ink-mute">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
                <span>
                  <span className="font-semibold text-ink-soft">{perda.toLocaleString("pt-BR")}</span>{" "}
                  {anterior.saida ?? "saíram"}{" "}
                  <span className="tabular-nums">({Math.round(proporcaoDaPerda * 100)}%)</span>
                </span>
              </p>
            ) : null}

            <div className="flex items-baseline justify-between gap-4">
              <p className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{etapa.rotulo}</p>
              <p className="text-apoio tabular-nums text-ink-mute">
                {i === 0 ? "todos que chegaram" : `${Math.round(proporcao * 100)}% de quem chegou`}
              </p>
            </div>

            <div className="mt-1.5 flex items-center gap-3">
              {/* Trilho de fundo com a largura total: sem ele, a barra curta
                  não teria contra o que ser comparada. */}
              <div className="h-9 min-w-0 flex-1 overflow-hidden rounded-lg bg-panel-soft">
                <div
                  className="h-full rounded-lg bg-accent transition-[width] duration-500 ease-soft"
                  style={{ width: `${Math.max(proporcao * 100, 1.5)}%` }}
                />
              </div>
              <p className="w-20 shrink-0 text-right font-display text-destaque font-semibold tabular-nums text-ink">
                {etapa.valor.toLocaleString("pt-BR")}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
