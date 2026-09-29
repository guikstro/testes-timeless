"use client";

import { useEffect, useState } from "react";
import { useNotificacoes } from "@/components/notifications/notification-provider";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { Tooltip } from "./tooltip";

/** O que a rota `GET /analytics/frescor` devolve. */
export type EstadoDaFonte = "em-dia" | "atrasada" | "falha";

export interface FrescorDaFonte {
  estado: EstadoDaFonte;
  atualizadoEm: string | null;
  motivo: string | null;
}

export interface Frescor {
  meta: FrescorDaFonte | null;
  google: FrescorDaFonte | null;
}

type Fonte = keyof Frescor;

const FONTES: Record<Fonte, { nome: string; atualizado: string }> = {
  meta: { nome: "Meta", atualizado: "atualizada" },
  google: { nome: "Google Ads", atualizado: "atualizado" },
};

/*
  Pontos sólidos de status: os tons fixos funcionam nos dois temas, ao
  contrário da tinta de estado, que no escuro é clara para ler sobre o fundo
  suave e viraria um ponto quase branco.
*/
const PONTO: Record<EstadoDaFonte, string> = {
  "em-dia": "bg-emerald-500",
  atrasada: "bg-amber-500",
  falha: "bg-red-500",
};

/** Redesenha de tempos em tempos para o "há 12 min" não envelhecer com a tela aberta. */
function useRelogio(intervaloMs = 30_000) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const relogio = window.setInterval(() => setTique((n) => n + 1), intervaloMs);
    return () => window.clearInterval(relogio);
  }, [intervaloMs]);
}

/**
 * De quando é o dado da tela, numa linha: "Ao vivo · Meta atualizada há 20 min
 * · Google Ads atualizado há 12 min".
 *
 * Um número sem data é lido como sendo de agora. Quando a sincronia para, a
 * tela continua cheia e ninguém percebe; esta linha é o que avisa. O ponto
 * nunca fala sozinho: a frase diz o estado, e a dica diz o motivo e a hora
 * exata.
 */
export function FrescorDosDados({
  frescor,
  fontes = ["meta", "google"],
  aoVivo = false,
  className,
}: {
  frescor: Frescor | null;
  /** Quais fontes alimentam a tela. Fonte sem conexão não aparece. */
  fontes?: Fonte[];
  /** A tela se atualiza sozinha quando chega lead ou mensagem. */
  aoVivo?: boolean;
  className?: string;
}) {
  useRelogio();
  const itens = fontes.flatMap((fonte) => {
    const dado = frescor?.[fonte];
    return dado ? [{ fonte, dado }] : [];
  });
  if (!aoVivo && itens.length === 0) return null;

  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-rotulo text-ink-mute ${className ?? ""}`}>
      {aoVivo ? <AoVivo /> : null}
      {itens.map(({ fonte, dado }) => (
        <ItemDaFonte key={fonte} fonte={fonte} dado={dado} />
      ))}
    </p>
  );
}

function ItemDaFonte({ fonte, dado }: { fonte: Fonte; dado: FrescorDaFonte }) {
  const { nome, atualizado } = FONTES[fonte];
  const texto =
    dado.estado === "falha"
      ? `${nome} com falha`
      : !dado.atualizadoEm
        ? `${nome} ainda sem dado`
        : dado.estado === "atrasada"
          ? `${nome} sem dado novo ${tempoRelativo(dado.atualizadoEm)}`
          : `${nome} ${atualizado} ${tempoRelativo(dado.atualizadoEm)}`;
  const dica = [dado.motivo, dado.atualizadoEm ? `Último dado: ${dataCompleta(dado.atualizadoEm)}.` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip conteudo={dica || `${nome} em dia.`}>
      <span tabIndex={0} className="focus-ring inline-flex items-center gap-1.5 rounded">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PONTO[dado.estado]}`} aria-hidden />
        {/* O servidor e o navegador contam o tempo cada um com o seu relógio. */}
        <span suppressHydrationWarning className={dado.estado === "em-dia" ? undefined : "text-ink-soft"}>
          {texto}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * Se a tela está recebendo as novidades na hora. Com o canal ao vivo fora, a
 * tela confere sozinha a cada 30 segundos (ver `AtualizaAoVivo`), e a linha
 * diz isso em vez de prometer o que não está acontecendo.
 */
function AoVivo() {
  const { conectado } = useNotificacoes();
  // O canal leva um instante para abrir. Sem esta espera, toda tela abriria
  // dizendo que a conexão caiu, para trocar para "Ao vivo" um segundo depois.
  const [caiu, setCaiu] = useState(false);
  useEffect(() => {
    if (conectado) {
      setCaiu(false);
      return;
    }
    const espera = window.setTimeout(() => setCaiu(true), 5_000);
    return () => window.clearTimeout(espera);
  }, [conectado]);

  if (!conectado && !caiu) return null;
  return (
    <Tooltip
      conteudo={
        conectado
          ? "A tela se atualiza sozinha quando chega lead ou mensagem."
          : "A conexão ao vivo caiu; a tela confere se há novidade a cada 30 segundos."
      }
    >
      <span tabIndex={0} className="focus-ring inline-flex items-center gap-1.5 rounded">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${conectado ? "animate-pulse bg-emerald-500" : "bg-ink-mute/50"}`}
          aria-hidden
        />
        {conectado ? "Ao vivo" : "Atualiza a cada 30 s"}
      </span>
    </Tooltip>
  );
}
