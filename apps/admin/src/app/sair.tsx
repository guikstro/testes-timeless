"use client";

import { useTransition } from "react";

export function Sair() {
  const [saindo, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={saindo}
      onClick={() =>
        iniciar(async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          // Recarregamento completo: a sessão morreu nos cookies, e só uma
          // requisição nova refaz o estado do servidor.
          window.location.href = "/login";
        })
      }
      className="focus-ring rounded text-corpo text-ink-mute transition-colors hover:text-ink disabled:opacity-60"
    >
      {saindo ? "Saindo" : "Sair"}
    </button>
  );
}
