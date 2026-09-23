"use client";

import { useState } from "react";

/**
 * Sinal de que o operador está agindo DENTRO de um cliente.
 *
 * Era uma faixa de 56 pixels no topo. Virou três sinais discretos, distribuídos
 * onde o olho já passa, porque uma barra de cor forte no topo é justamente o
 * tipo de elemento que se aprende a ignorar depois de dez minutos.
 *
 * Este é o primeiro sinal: um fio colado na borda superior da janela. Não
 * ocupa espaço do conteúdo e fica na visão periférica o tempo todo. Os outros
 * dois vivem na barra lateral (identidade trocada e botão de saída).
 *
 * O âmbar é escolha, não enfeite: verde diria "tudo certo" e vermelho diria
 * "erro", quando o que precisa ser dito é "atenção, esta não é a sua conta".
 */
export function ImpersonationHairline() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-gradient-to-r from-amber-500/50 via-amber-400 to-amber-500/50"
    />
  );
}

/**
 * Botão de saída, no rodapé da barra lateral junto dos outros controles de
 * sessão. É onde a pessoa já procura por "sair", em vez de flutuar numa faixa.
 *
 * O que ele faz mudou quando a administração virou site próprio. Antes, ele
 * restaurava a sessão do operador a partir de cookies estacionados aqui.
 * Agora não há o que restaurar: a sessão do operador nunca saiu do site da
 * administração, que continua aberto na aba de onde ele veio. Sair daqui é
 * só encerrar a sessão deste cliente.
 */
export function LeaveClientButton({ collapsedLabelClassName = "" }: { collapsedLabelClassName?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    setPending(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // A revogação no servidor é o ideal; sair da tela é o mínimo, e falhar
      // no primeiro não pode prender o operador dentro do cliente.
    }

    // Recarregamento completo: a sessão morreu nos cookies e o shell precisa
    // ser refeito sem ela.
    window.location.href = "/login?motivo=saiu-do-cliente";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void leave()}
        disabled={pending}
        title="Encerrar a visita a este cliente"
        aria-busy={pending || undefined}
        className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-amber-700 transition-all duration-200 ease-soft hover:bg-amber-500/10 active:scale-[0.98] disabled:opacity-50 dark:text-amber-400"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span className={collapsedLabelClassName}>{pending ? "Saindo" : "Encerrar visita"}</span>
      </button>
      {error ? <p className={`px-3 text-xs text-red-600 ${collapsedLabelClassName}`}>{error}</p> : null}
    </>
  );
}
