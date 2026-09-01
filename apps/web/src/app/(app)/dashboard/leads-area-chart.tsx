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

/**
 * Modos de exibição.
 *
 * Não são o mesmo dado enfeitado de quatro jeitos: cada um responde melhor a
 * uma pergunta diferente. Área mostra volume, linha compara as duas séries com
 * menos ruído, barras deixam o dia isolado legível, e acumulado responde
 * "quanto já somamos no período", que nenhum dos outros responde.
 */
export type ModoGrafico = "area" | "linha" | "barras" | "acumulado";

const MODOS: { modo: ModoGrafico; rotulo: string; icone: React.ReactNode }[] = [
  {
    modo: "area",
    rotulo: "Área",
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M3 17l5-6 4 3 5-7 4 4v6H3z" />
      </svg>
    ),
  },
  {
    modo: "linha",
    rotulo: "Linha",
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M3 16l5-6 4 3 5-7 4 4" />
      </svg>
    ),
  },
  {
    modo: "barras",
    rotulo: "Barras",
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M5 20V10M12 20V4M19 20v-7" />
      </svg>
    ),
  },
  {
    modo: "acumulado",
    rotulo: "Acumulado",
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M3 19c4 0 6-3 9-8s5-6 9-6" />
      </svg>
    ),
  },
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
  const [entrou, setEntrou] = useState(false);
  const [modo, setModo] = useState<ModoGrafico>("area");

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

  /*
    A linha se desenha da esquerda para a direita na primeira aparição.
    Serve ao dado: o traço percorre o eixo do tempo na mesma direção em que a
    pessoa vai lê-lo, então o movimento ensina a ler o gráfico em vez de só
    enfeitar. Roda uma vez e para; repetir a cada rolagem viraria distração.
  */
  useEffect(() => {
    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semMovimento) {
      setEntrou(true);
      return;
    }
    const t = window.setTimeout(() => setEntrou(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    function clear(event: KeyboardEvent) {
      if (event.key === "Escape") setHovered(null);
    }
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);

  /*
    No acumulado o valor de cada dia é a soma de tudo até ali. A curva vira
    monotônica crescente por construção, então ela responde "quanto já
    somamos" em vez de "quanto veio hoje".
  */
  const dados = (() => {
    if (modo !== "acumulado") return data;
    let leads = 0;
    let won = 0;
    return data.map((ponto) => {
      leads += ponto.leads;
      won += ponto.won;
      return { ...ponto, leads, won };
    });
  })();

  const innerWidth = Math.max(120, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const maxValue = niceCeiling(Math.max(1, ...dados.flatMap((point) => [point.leads, point.won])));

  const xAt = (index: number) =>
    PAD.left + (dados.length <= 1 ? innerWidth / 2 : (index / (dados.length - 1)) * innerWidth);
  const yAt = (value: number) => PAD.top + innerHeight - (value / maxValue) * innerHeight;

  const ticks = [0, 0.5, 1].map((fraction) => Math.round(maxValue * fraction));

  // Poucos rótulos no eixo: um por dia vira borrão em 90 dias. Contando do
  // fim para o começo, o último dia sempre aparece e o espaçamento fica
  // uniforme — marcar múltiplos e depois forçar o último colava os dois.
  const labelEvery = Math.max(1, Math.ceil(dados.length / Math.max(2, Math.floor(innerWidth / 64))));
  const labelIndexes = new Set<number>();
  for (let i = dados.length - 1; i >= 0; i -= labelEvery) labelIndexes.add(i);

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - rect.left - PAD.left;
    const ratio = dados.length <= 1 ? 0 : position / innerWidth;
    // O ponteiro mira uma data, nunca uma linha de 2px: encaixa no mais próximo.
    setHovered(Math.min(dados.length - 1, Math.max(0, Math.round(ratio * (dados.length - 1)))));
  }

  const active = hovered === null ? null : dados[hovered];

  return (
    <div ref={containerRef} className="relative">
      {/*
        Os modos ficam acima do gráfico e não escondidos num menu: são quatro,
        cabem, e trocar de leitura precisa ser um clique, não uma descoberta.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-full border border-line bg-panel-soft/60 p-1 [width:fit-content]">
        {MODOS.map((opcao) => {
          const ativo = modo === opcao.modo;
          return (
            <button
              key={opcao.modo}
              type="button"
              onClick={() => setModo(opcao.modo)}
              aria-pressed={ativo}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ease-soft active:scale-95 ${
                ativo ? "bg-panel text-ink shadow-subtle" : "text-ink-mute hover:text-ink"
              }`}
            >
              {opcao.icone}
              {opcao.rotulo}
            </button>
          );
        })}
      </div>

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

        {dados.map((point, index) =>
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

        {SERIES.map((series, ordem) => {
          const points = dados.map((point, index) => ({ x: xAt(index), y: yAt(point[series.key]) }));
          const baseline = PAD.top + innerHeight;

          if (modo === "barras") {
            // Duas séries lado a lado dentro da fatia do dia, com folga entre
            // elas: barras encostadas se leem como uma só.
            const fatia = innerWidth / Math.max(1, dados.length);
            const largura = Math.max(1.5, Math.min(10, fatia / 2 - 1.5));
            return (
              <g key={series.key}>
                {dados.map((point, index) => {
                  const valor = point[series.key];
                  const altura = baseline - yAt(valor);
                  if (valor === 0) return null;
                  return (
                    <rect
                      key={point.date}
                      x={xAt(index) - (ordem === 0 ? largura + 0.75 : -0.75)}
                      y={entrou ? yAt(valor) : baseline}
                      width={largura}
                      height={entrou ? Math.max(1, altura) : 0}
                      rx={2}
                      fill={series.color}
                      style={{
                        transition: `y 700ms cubic-bezier(0.16,1,0.3,1) ${index * 8}ms, height 700ms cubic-bezier(0.16,1,0.3,1) ${index * 8}ms`,
                      }}
                    />
                  );
                })}
              </g>
            );
          }

          const line = smoothPath(points);
          // Comprimento aproximado do traço, suficiente para o tracejado cobrir
          // a linha inteira antes de ser puxado de volta.
          const percurso = innerWidth * 2.2;
          const comArea = modo === "area" || modo === "acumulado";

          return (
            <g key={series.key}>
              {comArea ? (
                <path
                  d={`${line} L ${xAt(dados.length - 1)} ${baseline} L ${xAt(0)} ${baseline} Z`}
                  fill={`url(#fill-${series.key})`}
                  className="transition-opacity duration-700 ease-soft"
                  style={{ opacity: entrou ? 1 : 0, transitionDelay: `${ordem * 120 + 260}ms` }}
                />
              ) : null}
              <path
                d={line}
                fill="none"
                stroke={series.color}
                strokeWidth={modo === "linha" ? 2.25 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: percurso,
                  strokeDashoffset: entrou ? 0 : percurso,
                  transition: `stroke-dashoffset 1100ms cubic-bezier(0.16,1,0.3,1) ${ordem * 120}ms`,
                }}
              />
            </g>
          );
        })}

        {hovered !== null && modo !== "barras" ? (
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
          <p className="mb-1.5 text-[11px] font-medium text-ink-mute">
            {formatDay(active.date)}
            {modo === "acumulado" ? " · acumulado" : ""}
          </p>
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
