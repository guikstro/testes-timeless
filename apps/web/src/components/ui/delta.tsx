/**
 * Variação em relação ao período anterior.
 *
 * O sinal carrega ícone e texto além da cor, porque quem não distingue verde de
 * vermelho precisa da mesma informação: a seta e o percentual dizem tudo
 * sozinhos, e a cor só reforça.
 *
 * `null` significa que não havia base para comparar, e nesse caso a tela diz
 * "sem base" em vez de inventar uma porcentagem sobre zero.
 */
export function Delta({ delta, invertido = false }: { delta: number | null; invertido?: boolean }) {
  if (delta === null) {
    return <span className="text-rotulo text-ink-mute">sem base anterior</span>;
  }

  const parado = Math.abs(delta) < 0.005;
  // `invertido` para métricas em que cair é bom, como tempo de resposta.
  const bom = invertido ? delta < 0 : delta > 0;

  const cor = parado
    ? "text-ink-mute"
    : bom
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <span className={`inline-flex items-center gap-0.5 text-rotulo font-medium tabular-nums ${cor}`}>
      {parado ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3" aria-hidden>
          <path d="M5 12h14" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
          {delta > 0 ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
        </svg>
      )}
      {parado ? "estável" : `${Math.abs(Math.round(delta * 100))}%`}
    </span>
  );
}
