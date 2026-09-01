/**
 * Funil com a perda entre etapas.
 *
 * A versão anterior mostrava só quanto sobrou em cada estágio. O que interessa
 * a quem opera é o contrário: onde as pessoas param. Por isso a queda entre
 * duas etapas ganhou destaque próprio, entre as barras, em vez de precisar ser
 * calculada de cabeça a partir de dois números.
 *
 * Barras a partir de uma linha de base comum, e não trapézios afinando: a
 * forma clássica de funil codifica valor em área, que se lê muito pior que
 * comprimento, e faz duas etapas próximas parecerem iguais.
 */
export function FunnelChart({
  etapas,
}: {
  etapas: { rotulo: string; valor: number; nota?: string }[];
}) {
  const maior = Math.max(1, ...etapas.map((etapa) => etapa.valor));

  return (
    <div className="flex flex-col">
      {etapas.map((etapa, indice) => {
        const anterior = indice > 0 ? etapas[indice - 1].valor : null;
        const perdidos = anterior !== null ? anterior - etapa.valor : 0;
        const taxaPerda = anterior && anterior > 0 ? perdidos / anterior : 0;

        return (
          <div key={etapa.rotulo}>
            {anterior !== null ? (
              <div className="flex items-center gap-2 py-1.5 pl-[7.5rem] text-[11.5px]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3 w-3 shrink-0 text-ink-mute" aria-hidden>
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
                {perdidos > 0 ? (
                  <span className="text-ink-mute">
                    <span className="font-medium text-ink-soft">{perdidos}</span> não avançaram
                    <span className="tabular-nums"> ({Math.round(taxaPerda * 100)}%)</span>
                  </span>
                ) : (
                  <span className="text-ink-mute">todos avançaram</span>
                )}
              </div>
            ) : null}

            <div className="group flex items-center gap-3">
              <span className="w-28 shrink-0 text-[12.5px] text-ink-soft">{etapa.rotulo}</span>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-panel-soft">
                  <div
                    className="h-full rounded-lg bg-gradient-to-r from-accent/70 to-accent transition-[width] duration-700 ease-soft"
                    style={{ width: `${Math.max(1.5, (etapa.valor / maior) * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-[15px] font-semibold tabular-nums text-ink">
                  {etapa.valor}
                </span>
                {etapa.nota ? (
                  <span className="hidden w-14 shrink-0 text-[11.5px] tabular-nums text-ink-mute sm:block">
                    {etapa.nota}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
