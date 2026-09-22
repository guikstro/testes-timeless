"use client";

import { useState, useTransition } from "react";
import { removerVerba } from "./verba-actions";

/**
 * Apagar uma verba pede confirmação no próprio botão, e não numa janela.
 *
 * Apagar a verba errada desfaz o saldo e a projeção da tela inteira, e não há
 * como desfazer. A confirmação em dois toques custa um clique e evita isso.
 * Uma janela de confirmação custaria o mesmo e interromperia mais.
 */
export function BotaoRemoverVerba({ id, valor }: { id: string; valor: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, iniciar] = useTransition();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="focus-ring rounded-lg px-2 py-1 text-apoio text-ink-mute transition-colors hover:text-ink"
        aria-label={`Apagar a verba de ${valor}`}
      >
        Apagar
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-apoio">
      <button
        type="button"
        disabled={removendo}
        onClick={() => iniciar(() => removerVerba(id))}
        className="focus-ring rounded-lg px-2 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {removendo ? "Apagando" : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="focus-ring rounded-lg px-2 py-1 text-ink-mute transition-colors hover:text-ink"
      >
        Cancelar
      </button>
    </span>
  );
}
