"use client";

import { useState } from "react";

/**
 * Aviso permanente de que o operador está agindo DENTRO de um cliente.
 *
 * Fica no topo de todas as telas de propósito e não pode ser fechado: a
 * proteção contra editar os dados do cliente achando que são os seus é
 * justamente ele estar sempre visível.
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
        // A sessão de operador expirou enquanto você estava aqui dentro; os
        // cookies já foram limpos, então o caminho é refazer o login.
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
    <div className="flex items-center justify-between gap-4 bg-amber-400 px-6 py-2 text-sm text-amber-950">
      <p>
        Você está dentro do cliente <span className="font-semibold">{organizationName}</span> como operador da
        plataforma. Tudo o que fizer aqui altera os dados dele.
      </p>
      <div className="flex shrink-0 items-center gap-3">
        {error ? <span className="text-xs text-red-800">{error}</span> : null}
        <button
          onClick={() => void leave()}
          disabled={pending}
          className="rounded-md bg-amber-950 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-900 disabled:opacity-50"
        >
          {pending ? "Saindo..." : "Sair do cliente"}
        </button>
      </div>
    </div>
  );
}
