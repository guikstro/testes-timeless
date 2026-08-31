"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Tela para quem tenta abrir a administração enquanto está dentro de um
 * cliente.
 *
 * A recusa em si é proposital: de dentro de um cliente não se enxerga nem se
 * entra em outro, o que mantém legível quem está onde. O que estava errado era
 * a apresentação, um erro de execução cru numa situação prevista e com saída
 * conhecida. Aqui a saída é o próprio botão.
 */
export function LeaveClientNotice() {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/admin/stop-impersonating", { method: "POST" });
    } finally {
      // Recarregamento completo, e não navegação do roteador: a identidade
      // mudou nos cookies, e só uma nova requisição refaz a sessão no servidor.
      window.location.href = "/admin";
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="surface animate-rise-in w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 17a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
        </span>

        <h1 className="font-display text-lg font-semibold tracking-tight text-ink">
          Você está dentro de um cliente
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          A administração não abre de dentro de uma conta de cliente, para ficar sempre claro em qual conta cada
          ação aconteceu. Saia do cliente para voltar ao painel.
        </p>

        <Button onClick={sair} loading={saindo} size="lg" className="mt-6 w-full">
          {saindo ? "Saindo" : "Sair do cliente"}
        </Button>
      </div>
    </div>
  );
}
