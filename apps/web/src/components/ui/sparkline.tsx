/**
 * Curva minúscula dentro do cartão.
 *
 * Não substitui o gráfico grande: ela responde "veio subindo ou caindo?" no
 * mesmo olhar que lê o número, sem eixo, sem rótulo e sem interação. Um
 * gráfico pequeno com eixos seria ilegível e um número sozinho esconde a
 * trajetória que o produziu.
 */
export function Sparkline({ pontos, className = "" }: { pontos: number[]; className?: string }) {
  if (pontos.length < 2) return null;

  const largura = 100;
  const altura = 28;
  const maximo = Math.max(1, ...pontos);
  const passo = largura / (pontos.length - 1);

  const coordenadas = pontos.map((valor, i) => ({
    x: i * passo,
    y: altura - (valor / maximo) * (altura - 3) - 1.5,
  }));

  const linha = coordenadas.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${linha} L ${largura} ${altura} L 0 ${altura} Z`;
  const ultimo = coordenadas[coordenadas.length - 1];

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      className={`h-7 w-full ${className}`}
      aria-hidden
    >
      <path d={area} fill="rgb(var(--accent) / 0.10)" />
      <path
        d={linha}
        fill="none"
        stroke="rgb(var(--accent))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Ponto no fim: ancora o olho no valor mais recente, que é o que o
          número ao lado está mostrando. */}
      <circle cx={ultimo.x} cy={ultimo.y} r={2} fill="rgb(var(--accent))" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
