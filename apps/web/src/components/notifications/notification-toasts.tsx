"use client";

import Link from "next/link";
import { useEffect } from "react";
import { EventoDeNotificacao, ROTULO_POR_TIPO } from "@/lib/notifications/tipos";
import { corDaNotificacao, IconeDaNotificacao } from "./notification-icons";
import { useNotificacoes } from "./notification-provider";

/** Tempo na tela antes de sair sozinho. */
const DURACAO_MS = 5000;
/** Teto de cartões visíveis: acima disso o canto da tela vira uma parede. */
const NA_PILHA = 3;

export function NotificationToasts() {
  const { avisosNaTela, dispensarAviso } = useNotificacoes();
  const visiveis = avisosNaTela.slice(-NA_PILHA);

  return (
    <div
      // `polite` e não `assertive`: um lead novo é importante, não é uma
      // emergência que justifique interromper a leitura em curso.
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
    >
      {visiveis.map((aviso) => (
        <Aviso
          key={aviso.chave}
          evento={aviso.evento}
          aoDispensar={() => dispensarAviso(aviso.chave)}
        />
      ))}
    </div>
  );
}

function Aviso({ evento, aoDispensar }: { evento: EventoDeNotificacao; aoDispensar: () => void }) {
  useEffect(() => {
    const relogio = setTimeout(aoDispensar, DURACAO_MS);
    return () => clearTimeout(relogio);
  }, [aoDispensar]);

  const conteudo = (
    <>
      <span className={`mt-0.5 shrink-0 ${corDaNotificacao(evento.type)}`}>
        <IconeDaNotificacao tipo={evento.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
          {ROTULO_POR_TIPO[evento.type]}
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">{evento.title}</span>
        {evento.body ? (
          <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{evento.body}</span>
        ) : null}
      </span>
    </>
  );

  const classe =
    "pointer-events-auto flex w-full animate-rise-in gap-2.5 rounded-2xl border border-line bg-panel p-3 text-left shadow-lifted";

  return (
    <div className="relative">
      {/*
        Clicável quando há lead: o valor de um aviso de lead novo está em
        chegar na conversa em um toque, e não em ser lido e esquecido.
      */}
      {evento.leadId ? (
        <Link href={`/leads/${evento.leadId}`} onClick={aoDispensar} className={`focus-ring ${classe}`}>
          {conteudo}
        </Link>
      ) : (
        <div className={classe}>{conteudo}</div>
      )}

      <button
        type="button"
        onClick={aoDispensar}
        aria-label="Dispensar aviso"
        className="focus-ring pointer-events-auto absolute right-1.5 top-1.5 rounded-full p-1 text-ink-mute transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3 w-3" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
