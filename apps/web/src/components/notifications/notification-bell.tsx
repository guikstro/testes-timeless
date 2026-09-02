"use client";

import Link from "next/link";
import { useState } from "react";
import { ROTULO_POR_TIPO } from "@/lib/notifications/tipos";
import { tempoRelativo } from "@/lib/relative-time";
import { corDaNotificacao, IconeDaNotificacao } from "./notification-icons";
import { useNotificacoes } from "./notification-provider";

export function NotificationBell() {
  const { naoLidas, recentes, conectado, marcarComoLida, marcarTodasComoLidas } = useNotificacoes();
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((estava) => !estava)}
        aria-expanded={aberto}
        aria-label={naoLidas > 0 ? `Avisos, ${naoLidas} não lidos` : "Avisos"}
        className="focus-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>

        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-red-500 px-1 text-rotulo font-semibold leading-4 text-white">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* Camada invisível: fechar clicando fora sem prender o foco. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right animate-rise-in overflow-hidden rounded-2xl border border-line bg-panel shadow-lifted">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Avisos</h2>
              {naoLidas > 0 && (
                <button
                  type="button"
                  onClick={() => void marcarTodasComoLidas()}
                  className="focus-ring rounded-full px-2 py-1 text-apoio font-medium text-ink-soft transition-colors hover:text-ink"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-y-auto">
              {recentes.length === 0 ? (
                <p className="px-4 py-8 text-center text-corpo text-ink-mute">Nenhum aviso por enquanto.</p>
              ) : (
                recentes.map((linha) => {
                  const conteudo = (
                    <>
                      <span className={`mt-0.5 shrink-0 ${corDaNotificacao(linha.type)}`}>
                        <IconeDaNotificacao tipo={linha.type} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-corpo font-medium text-ink">{linha.title}</span>
                          <span className="shrink-0 text-rotulo text-ink-mute">
                            {tempoRelativo(linha.createdAt)}
                          </span>
                        </span>
                        {linha.body ? (
                          <span className="mt-0.5 block truncate text-apoio text-ink-soft">{linha.body}</span>
                        ) : null}
                        <span className="mt-0.5 block text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                          {ROTULO_POR_TIPO[linha.type]}
                        </span>
                      </span>
                      {/* Ponto só nas não lidas: é o que separa o que ainda pede atenção. */}
                      {!linha.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    </>
                  );

                  const classe = `flex w-full gap-2.5 border-b border-line/60 px-4 py-3 text-left transition-colors last:border-0 ${
                    linha.read ? "opacity-65" : "bg-panel-soft/40"
                  } hover:bg-panel-soft`;

                  return linha.leadId ? (
                    <Link
                      key={linha.id}
                      href={`/leads/${linha.leadId}`}
                      onClick={() => {
                        setAberto(false);
                        if (!linha.read) void marcarComoLida(linha.id);
                      }}
                      className={`focus-ring ${classe}`}
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <button
                      key={linha.id}
                      type="button"
                      onClick={() => void marcarComoLida(linha.id)}
                      className={`focus-ring ${classe}`}
                    >
                      {conteudo}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => setAberto(false)}
                className="focus-ring rounded-full px-2 py-1 text-apoio font-medium text-ink-soft transition-colors hover:text-ink"
              >
                Ver todos
              </Link>
              {/*
                Dizer quando o tempo real está fora é mais honesto que um sino
                mudo: sem isso, "nenhum aviso" e "não estou recebendo aviso
                nenhum" parecem a mesma coisa na tela.
              */}
              {!conectado && <span className="px-2 text-rotulo text-ink-mute">Reconectando…</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
