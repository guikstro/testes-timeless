"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Gráfico de área com duas séries, desenhado em SVG.
 *
 * Sem biblioteca de gráficos: o produto precisa de uma série temporal curta
 * (7 a 90 pontos) e de um tooltip. Recharts resolveria, mas traz ~450KB para
 * um gráfico só — e aqui o controle sobre curva, espessura e opacidade importa
 * mais que a economia de código.
 *
 * As escolhas visuais seguem regras, não gosto: preenchimento em lavagem (o
 * dado é o que pode ser forte, não o fundo), linha de 2px, grade sólida de
 * 1px recuada, e um par de cores validado para daltonismo — azul #2a78d6 e
 * laranja #eb6834 têm separação ΔE 24.7 em protanopia.
 */

export interface DailyPoint {
  date: string;
  leads: number;
  won: number;
}

// A cor sai de variável para o tema escuro receber o seu próprio passo do
// mesmo tom, em vez de a mesma tinta clareada.
const SERIES = [
  { key: "leads" as const, label: "Leads", color: "rgb(var(--serie-1))" },
  { key: "won" as const, label: "Vendas", color: "rgb(var(--serie-2))" },
];

const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

/**
 * Interpolação cúbica monotônica (Fritsch–Carlson). Uma spline comum passaria
 * abaixo de zero entre dois dias de valor baixo, desenhando leads negativos;
 * esta não ultrapassa os pontos que liga.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    slopes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i += 1) {
    // Um extremo local recebe tangente zero — é o que impede o overshoot.
    tangents.push(slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2);
  }
  tangents.push(slopes[n - 2]);

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const dx = (points[i + 1].x - points[i].x) / 3;
    path += ` C ${points[i].x + dx} ${points[i].y + tangents[i] * dx}`;
    path += ` ${points[i + 1].x - dx} ${points[i + 1].y - tangents[i + 1] * dx}`;
    path += ` ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return path;
}

/** Topo do eixo em número redondo: ticks quebrados são ruído. */
function niceCeiling(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function LeadsAreaChart({ data }: { data: DailyPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Medir em vez de escalar por viewBox: com viewBox o texto encolheria
    // junto com a largura, e os rótulos ficariam ilegíveis no celular.
    const measure = () => setWidth(element.getBoundingClientRect().width);

    // Medição síncrona na montagem, sem esperar o observer: em ambientes onde
    // o ResizeObserver não dispara, confiar só nele deixaria a largura presa
    // no valor inicial e o gráfico transbordaria o card.
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Rede para o mesmo caso: nem todo ambiente entrega o observer.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    function clear(event: KeyboardEvent) {
      if (event.key === "Escape") setHovered(null);
    }
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);

  const innerWidth = Math.max(120, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const maxValue = niceCeiling(Math.max(1, ...data.flatMap((point) => [point.leads, point.won])));

  const xAt = (index: number) =>
    PAD.left + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const yAt = (value: number) => PAD.top + innerHeight - (value / maxValue) * innerHeight;

  const ticks = [0, 0.5, 1].map((fraction) => Math.round(maxValue * fraction));

  // Poucos rótulos no eixo: um por dia vira borrão em 90 dias. Contando do
  // fim para o começo, o último dia sempre aparece e o espaçamento fica
  // uniforme — marcar múltiplos e depois forçar o último colava os dois.
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerWidth / 64))));
  const labelIndexes = new Set<number>();
  for (let i = data.length - 1; i >= 0; i -= labelEvery) labelIndexes.add(i);

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - rect.left - PAD.left;
    const ratio = data.length <= 1 ? 0 : position / innerWidth;
    // O ponteiro mira uma data, nunca uma linha de 2px: encaixa no mais próximo.
    setHovered(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))));
  }

  const active = hovered === null ? null : data[hovered];

  return (
    <div ref={containerRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Leads e vendas por dia no período"
        onPointerMove={handleMove}
        onPointerLeave={() => setHovered(null)}
        // Trava de segurança: mesmo com a largura medida errada, o gráfico
        // nunca empurra a página para o lado.
        className="max-w-full touch-pan-y"
      >
        <defs>
          {SERIES.map((series) => (
            <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series.color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={series.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerWidth}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="rgb(var(--grade))"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end" className="fill-[rgb(var(--ink-mute))] text-[11px]">
              {tick}
            </text>
          </g>
        ))}

        {data.map((point, index) =>
          labelIndexes.has(index) ? (
            <text
              key={point.date}
              x={xAt(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-mute))] text-[11px]"
            >
              {formatDay(point.date)}
            </text>
          ) : null,
        )}

        {SERIES.map((series) => {
          const points = data.map((point, index) => ({ x: xAt(index), y: yAt(point[series.key]) }));
          const line = smoothPath(points);
          const baseline = PAD.top + innerHeight;
          return (
            <g key={series.key}>
              <path d={`${line} L ${xAt(data.length - 1)} ${baseline} L ${xAt(0)} ${baseline} Z`} fill={`url(#fill-${series.key})`} />
              <path d={line} fill="none" stroke={series.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {hovered !== null ? (
          <g>
            <line
              x1={xAt(hovered)}
              x2={xAt(hovered)}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              stroke="rgb(var(--guia))"
              strokeWidth={1}
            />
            {SERIES.map((series) => (
              // Anel na cor da superfície: mantém o ponto legível onde as duas
              // séries se cruzam, sem desenhar contorno de dado que não é dado.
              <circle
                key={series.key}
                cx={xAt(hovered)}
                cy={yAt(data[hovered][series.key])}
                r={4}
                fill={series.color}
                stroke="rgb(var(--panel))"
                strokeWidth={2}
              />
            ))}
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[132px] rounded-lg border border-line bg-panel p-2.5 shadow-lg"
          style={{
            // Vira para o outro lado perto da borda direita, para não sair do card.
            left: Math.min(Math.max(xAt(hovered!) + 12, 8), Math.max(8, width - 148)),
          }}
        >
          <p className="mb-1.5 text-[11px] font-medium text-ink-mute">{formatDay(active.date)}</p>
          {SERIES.map((series) => (
            <div key={series.key} className="flex items-center gap-2 text-sm">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: series.color }} />
              <span className="font-semibold tabular-nums text-ink">{active[series.key]}</span>
              <span className="text-xs text-ink-mute">{series.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-4">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-2 text-xs text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
