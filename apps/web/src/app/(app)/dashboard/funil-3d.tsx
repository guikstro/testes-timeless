"use client";

import { useState } from "react";

/**
 * O funil como objeto, não como gráfico de barras deitado.
 *
 * A ideia que organiza este componente: o volume tridimensional **é** o dado.
 * Cada disco tem o raio proporcional à etapa, e a parede entre dois discos é
 * a perda entre eles. Não há enfeite tridimensional ao lado do número; a
 * forma é o número.
 *
 * Sem three.js de propósito. Uma tela aberta o dia inteiro não paga o custo
 * de um contexto WebGL para desenhar quatro discos, e a profundidade aqui sai
 * de perspectiva, gradiente e sombra, que o navegador já faz de graça.
 */
export interface EtapaDoFunil {
  rotulo: string;
  valor: number;
  /** Texto curto sob o rótulo, como a taxa de conversão da etapa. */
  nota?: string;
}

const LARGURA = 520;
/** Achatamento da elipse: quanto menor, mais de cima se olha o objeto. */
const ACHATAMENTO = 0.26;
const RAIO_MAXIMO = 190;
const RAIO_MINIMO = 26;
const ALTURA_DA_PAREDE = 74;
const MARGEM_TOPO = 40;
const PONTOS = 40;

/** Metade da frente da elipse, amostrada em pontos, do lado direito ao esquerdo. */
function frenteDaElipse(cx: number, cy: number, rx: number, ry: number, inverter = false): string {
  const pontos: string[] = [];
  for (let i = 0; i <= PONTOS; i += 1) {
    const t = (Math.PI * i) / PONTOS;
    const angulo = inverter ? Math.PI - t : t;
    pontos.push(`${(cx + rx * Math.cos(angulo)).toFixed(2)},${(cy + ry * Math.sin(angulo)).toFixed(2)}`);
  }
  return pontos.join(" ");
}

export function Funil3D({ etapas }: { etapas: EtapaDoFunil[] }) {
  const [ativa, setAtiva] = useState<number | null>(null);

  const maior = Math.max(...etapas.map((etapa) => etapa.valor), 1);
  const cx = LARGURA / 2;

  // O raio nunca vai a zero: uma etapa com um único lead precisa continuar
  // visível, ou o funil sugeriria que ela não existe.
  const raio = (valor: number) => RAIO_MINIMO + (RAIO_MAXIMO - RAIO_MINIMO) * (valor / maior);
  const yDoDisco = (i: number) => MARGEM_TOPO + i * ALTURA_DA_PAREDE;
  // A margem de baixo acompanha o último disco, que é o menor. Reservar o
  // raio máximo deixava um vão morto do tamanho do disco de cima.
  const raioFinal = raio(etapas[etapas.length - 1]?.valor ?? 0);
  const altura = MARGEM_TOPO + (etapas.length - 1) * ALTURA_DA_PAREDE + raioFinal * ACHATAMENTO + 26;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${LARGURA} ${altura}`}
        // Teto no tamanho natural: escalar além disso engorda os traços e o
        // objeto passa a dominar a tela em vez de ancorá-la.
        className="mx-auto block w-full max-w-[520px]"
        role="img"
        aria-label={`Funil: ${etapas.map((e) => `${e.rotulo} ${e.valor}`).join(", ")}`}
      >
        <defs>
          {/* A parede escurece para baixo: é o que faz o olho ler volume. */}
          <linearGradient id="parede-funil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id="parede-funil-ativa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.5" />
          </linearGradient>
          {/* Tampo iluminado de cima, como uma superfície que recebe luz. */}
          <radialGradient id="tampo-funil" cx="50%" cy="30%" r="75%">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.45" />
          </radialGradient>
          <filter id="sombra-funil" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="rgb(var(--accent))" floodOpacity="0.18" />
          </filter>
        </defs>

        <g filter="url(#sombra-funil)">
          {etapas.slice(0, -1).map((etapa, i) => {
            const rTopo = raio(etapa.valor);
            const rBase = raio(etapas[i + 1].valor);
            const yTopo = yDoDisco(i);
            const yBase = yDoDisco(i + 1);

            // A parede vai da frente do disco de cima até a frente do de
            // baixo. Amostrar a elipse em pontos evita depender das bandeiras
            // de arco do SVG, que erram de orientação com facilidade.
            const parede = [
              frenteDaElipse(cx, yTopo, rTopo, rTopo * ACHATAMENTO),
              frenteDaElipse(cx, yBase, rBase, rBase * ACHATAMENTO, true),
            ].join(" ");

            const destacada = ativa === i;

            return (
              <polygon
                key={etapa.rotulo}
                points={parede}
                fill={destacada ? "url(#parede-funil-ativa)" : "url(#parede-funil)"}
                className="cursor-pointer transition-[fill] duration-300 ease-soft"
                onMouseEnter={() => setAtiva(i)}
                onMouseLeave={() => setAtiva(null)}
              />
            );
          })}

          {/* Os tampos por cima das paredes, para a borda de cada etapa aparecer. */}
          {etapas.map((etapa, i) => {
            const r = raio(etapa.valor);
            return (
              <ellipse
                key={`tampo-${etapa.rotulo}`}
                cx={cx}
                cy={yDoDisco(i)}
                rx={r}
                ry={r * ACHATAMENTO}
                fill={i === 0 ? "url(#tampo-funil)" : "rgb(var(--canvas))"}
                fillOpacity={i === 0 ? 1 : 0.22}
                stroke="rgb(var(--accent))"
                strokeOpacity={ativa === i || ativa === i - 1 ? 0.9 : 0.45}
                strokeWidth={1.2}
                className="pointer-events-none transition-[stroke-opacity] duration-300 ease-soft"
              />
            );
          })}
        </g>
      </svg>

      {/* Os rótulos fora do desenho: dentro do objeto eles brigariam com a
          forma, e a forma é o que precisa ser lida primeiro. */}
      <ul className="mx-auto mt-4 grid max-w-[560px] grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {etapas.map((etapa, i) => {
          const anterior = i > 0 ? etapas[i - 1].valor : null;
          const perda = anterior && anterior > 0 ? 1 - etapa.valor / anterior : null;

          return (
            <li
              key={etapa.rotulo}
              onMouseEnter={() => setAtiva(i > 0 ? i - 1 : 0)}
              onMouseLeave={() => setAtiva(null)}
              className={`rounded-xl px-2.5 py-2 transition-colors duration-200 ease-soft ${
                ativa === i || ativa === i - 1 ? "bg-accent/10" : ""
              }`}
            >
              <p className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{etapa.rotulo}</p>
              <p className="mt-0.5 font-display text-destaque font-semibold tabular-nums text-ink">{etapa.valor}</p>
              {/* A perda entre etapas é a pergunta do funil: onde some gente. */}
              {perda !== null && perda > 0 ? (
                <p className="text-rotulo text-ink-mute">saíram {Math.round(perda * 100)}%</p>
              ) : etapa.nota ? (
                <p className="text-rotulo text-ink-mute">{etapa.nota}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
