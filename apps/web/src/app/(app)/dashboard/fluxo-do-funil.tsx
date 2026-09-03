"use client";

import { useState } from "react";

/**
 * Para onde as pessoas vão, e não só quantas sobram.
 *
 * O funil clássico mostra os sobreviventes de cada etapa: quatro números que
 * se leem mais rápido numa lista. O que ele esconde é a saída, que é onde
 * está a decisão. Aqui a faixa principal afina a cada etapa e o que sai desce
 * em ramos próprios, com a espessura da perda.
 *
 * As curvas são cúbicas de propósito. Um fluxo feito de retas parece um
 * diagrama; feito de curvas parece movimento, e movimento é o que se quer
 * dizer aqui, porque as pessoas de fato se movem entre as etapas.
 */
export interface EtapaDoFluxo {
  chave: string;
  rotulo: string;
  valor: number;
  /** Como chamar quem saiu antes de chegar na etapa seguinte. */
  saida?: string;
}

const LARGURA = 900;
const ALTURA = 320;
/** A faixa começa abaixo do bloco de rótulos, que ocupa uma altura fixa. */
const TOPO = 76;
const ESPESSURA_MAXIMA = 132;
const MARGEM = 8;

interface Segmento {
  etapa: EtapaDoFluxo;
  x: number;
  espessura: number;
}

/** Faixa entre dois pontos, com as bordas em curva suave. */
function faixa(x1: number, y1a: number, y1b: number, x2: number, y2a: number, y2b: number): string {
  const meio = (x1 + x2) / 2;
  return [
    `M ${x1} ${y1a}`,
    `C ${meio} ${y1a}, ${meio} ${y2a}, ${x2} ${y2a}`,
    `L ${x2} ${y2b}`,
    `C ${meio} ${y2b}, ${meio} ${y1b}, ${x1} ${y1b}`,
    "Z",
  ].join(" ");
}

export function FluxoDoFunil({ etapas }: { etapas: EtapaDoFluxo[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);

  const maior = Math.max(...etapas.map((e) => e.valor), 1);
  const passo = (LARGURA - MARGEM * 2) / (etapas.length - 1);

  const segmentos: Segmento[] = etapas.map((etapa, i) => ({
    etapa,
    x: MARGEM + i * passo,
    espessura: Math.max(3, (etapa.valor / maior) * ESPESSURA_MAXIMA),
  }));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full" role="img" aria-label={rotuloAcessivel(etapas)}>
        <defs>
          <linearGradient id="fluxo-principal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.85" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="fluxo-perda" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--ink-mute))" stopOpacity="0.30" />
            <stop offset="100%" stopColor="rgb(var(--ink-mute))" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {segmentos.slice(0, -1).map((atual, i) => {
          const proximo = segmentos[i + 1];
          const perda = Math.max(0, atual.etapa.valor - proximo.etapa.valor);
          const espessuraDaPerda = (perda / maior) * ESPESSURA_MAXIMA;
          const destacado = ativo === i;

          return (
            <g
              key={atual.etapa.chave}
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              className="cursor-pointer"
            >
              {/* Quem seguiu: a faixa principal, afinando. */}
              <path
                d={faixa(atual.x, TOPO, TOPO + atual.espessura, proximo.x, TOPO, TOPO + proximo.espessura)}
                fill="url(#fluxo-principal)"
                opacity={destacado ? 1 : 0.82}
                className="transition-opacity duration-300 ease-soft"
              />

              {/*
                Quem saiu, descendo. O ramo desce em curva e some: ele não
                termina em nenhuma etapa, porque essas pessoas não estão em
                lugar nenhum do funil, e um retângulo fechado sugeriria que
                ainda dá para recuperá-las de algum lugar.
              */}
              {espessuraDaPerda > 1 ? (
                <path
                  d={faixa(
                    atual.x + (proximo.x - atual.x) * 0.18,
                    TOPO + atual.espessura - espessuraDaPerda,
                    TOPO + atual.espessura,
                    proximo.x,
                    ALTURA - 108,
                    ALTURA - 108 + espessuraDaPerda,
                  )}
                  fill="url(#fluxo-perda)"
                  opacity={destacado ? 1 : 0.7}
                  className="transition-opacity duration-300 ease-soft"
                />
              ) : null}
            </g>
          );
        })}

        {/*
          Rótulo e número numa faixa só, no topo, com a mesma linha de base
          para todas as etapas. Ancorados na espessura da faixa eles subiam e
          desciam a cada etapa, e o olho lia dispersão onde deveria ler
          sequência.
        */}
        {segmentos.map((segmento, i) => {
          const ancora = i === 0 ? "start" : i === segmentos.length - 1 ? "end" : "middle";
          const aceso = ativo === i || ativo === i - 1;

          return (
            <g key={`marca-${segmento.etapa.chave}`}>
              <text
                x={segmento.x}
                y={22}
                textAnchor={ancora}
                className="fill-ink-mute text-[12.5px] font-semibold uppercase tracking-[0.1em]"
              >
                {segmento.etapa.rotulo}
              </text>
              <text
                x={segmento.x}
                y={56}
                textAnchor={ancora}
                className="fill-ink text-[30px] font-semibold tabular-nums"
              >
                {segmento.etapa.valor}
              </text>
              <rect
                x={segmento.x - 1.5}
                y={TOPO}
                width={3}
                height={segmento.espessura}
                rx={1.5}
                fill="rgb(var(--accent))"
                opacity={aceso ? 1 : 0.55}
                className="transition-opacity duration-300 ease-soft"
              />
            </g>
          );
        })}

        {/* As perdas, escritas onde o ramo termina. */}
        {segmentos.slice(0, -1).map((atual, i) => {
          const proximo = segmentos[i + 1];
          const perda = Math.max(0, atual.etapa.valor - proximo.etapa.valor);
          if (perda === 0) return null;
          const proporcao = atual.etapa.valor > 0 ? perda / atual.etapa.valor : 0;

          return (
            <text
              key={`perda-${atual.etapa.chave}`}
              x={(atual.x + proximo.x) / 2 + 40}
              y={ALTURA - 26}
              textAnchor="middle"
              className="fill-ink-mute text-[12.5px]"
              opacity={ativo === i ? 1 : 0.72}
            >
              <tspan className="font-semibold">{Math.round(proporcao * 100)}%</tspan> {atual.etapa.saida ?? "saíram"}
              <tspan dx="6">({perda})</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function rotuloAcessivel(etapas: EtapaDoFluxo[]): string {
  const partes = etapas.map((etapa, i) => {
    if (i === 0) return `${etapa.rotulo}: ${etapa.valor}`;
    const perda = etapas[i - 1].valor - etapa.valor;
    return `${etapa.rotulo}: ${etapa.valor}, ${perda} saíram antes`;
  });
  return `Fluxo do funil. ${partes.join(". ")}.`;
}
