"use client";

import { useState } from "react";
import { copiarTexto } from "@/lib/clipboard";

/**
 * Botão de copiar, com confirmação no próprio botão.
 *
 * A confirmação fica onde o dedo já está, e não num aviso no canto da tela:
 * quem copia um link precisa saber que copiou antes de sair colando, e um
 * aviso longe do clique deixa a dúvida de pé.
 */
export function BotaoCopiar({
  texto,
  rotulo = "Copiar",
  className,
}: {
  texto: string;
  /** Descrição para leitor de tela, já que o botão só mostra o ícone. */
  rotulo?: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  async function copiar() {
    const deuCerto = await copiarTexto(texto);
    setEstado(deuCerto ? "copiado" : "falhou");
    window.setTimeout(() => setEstado("parado"), 2200);
  }

  return (
    <button
      type="button"
      onClick={() => void copiar()}
      title={estado === "falhou" ? "Não consegui copiar, selecione e copie à mão" : rotulo}
      aria-label={rotulo}
      className={`focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-mute transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-90 ${className ?? ""}`}
    >
      {estado === "copiado" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : estado === "falhou" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden>
          <path d="M12 8v5M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
      <span className="sr-only" aria-live="polite">
        {estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não foi possível copiar" : ""}
      </span>
    </button>
  );
}
