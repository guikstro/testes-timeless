"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Aviso permanente de que o operador está agindo DENTRO de um cliente.
 *
 * Fica no topo de todas as telas e não pode ser fechado: a proteção contra
 * editar os dados do cliente achando que são os seus é justamente ele estar
 * sempre visível.
 *
 * O tom âmbar é deliberado e não decorativo. Verde diria "tudo certo", e
 * vermelho diria "erro"; o que precisa ser dito é "atenção, você não está na
 * sua conta", que é exatamente o que âmbar comunica.
 */
export function ImpersonationBanner({ organizationName }: { organizationName: string }) {
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
      setError("Não foi possível sair. Recarregue a página.");
      setPending(false);
      return;
    }

    // Recarregamento completo pelo mesmo motivo da entrada: a identidade da
    // sessão mudou nos cookies e o shell precisa ser refeito com ela.
    window.location.href = "/admin";
  }

  return (
    <div className="relative z-40 flex h-14 shrink-0 items-center gap-4 border-b border-amber-500/25 bg-amber-50 px-5 dark:bg-amber-950/40">
      <span className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
        {/* Ponto pulsante: o estado é contínuo, e algo vivo lembra disso melhor
            que um ícone parado que o olho aprende a ignorar. */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
      </span>

      <p className="min-w-0 flex-1 truncate text-[13px] text-amber-900 dark:text-amber-100">
        Você está dentro de <span className="font-semibold">{organizationName}</span> como operador.
        <span className="hidden sm:inline"> Tudo o que fizer aqui altera os dados desse cliente.</span>
      </p>

      {error ? <span className="hidden text-xs text-red-700 dark:text-red-300 sm:inline">{error}</span> : null}

      <Button
        onClick={() => void leave()}
        loading={pending}
        size="sm"
        className="shrink-0 border border-amber-600/30 bg-amber-500 text-amber-950 hover:brightness-105"
      >
        {pending ? "Saindo" : "Sair do cliente"}
      </Button>
    </div>
  );
}
