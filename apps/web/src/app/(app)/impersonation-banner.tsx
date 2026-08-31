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
 */
export function LeaveClientButton({ collapsedLabelClassName = "" }: { collapsedLabelClassName?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    setPending(true);

    const response = await fetch("/api/admin/stop-impersonating", { method: "POST" });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if (body?.reason === "ADMIN_SESSION_EXPIRED") {
        // A sessão de operador expirou aqui dentro; os cookies já foram
        // limpos, então o caminho é refazer o login.
        window.location.href = "/login";
        return;
      }
      setError("Não foi possível sair.");
      setPending(false);
      return;
    }

    // Recarregamento completo pelo mesmo motivo da entrada: a identidade da
    // sessão mudou nos cookies e o shell precisa ser refeito com ela.
    window.location.href = "/admin";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void leave()}
        disabled={pending}
        title="Sair do cliente"
        aria-busy={pending || undefined}
        className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-amber-700 transition-all duration-200 ease-soft hover:bg-amber-500/10 active:scale-[0.98] disabled:opacity-50 dark:text-amber-400"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span className={collapsedLabelClassName}>{pending ? "Saindo" : "Sair do cliente"}</span>
      </button>
      {error ? <p className={`px-3 text-xs text-red-600 ${collapsedLabelClassName}`}>{error}</p> : null}
    </>
  );
}
