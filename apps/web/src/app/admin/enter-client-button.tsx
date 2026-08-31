"use client";

import { useState } from "react";

/**
 * Entra no cliente. A troca de sessão acontece num route handler
 * (`/api/admin/impersonate`) porque os cookies são httpOnly e só podem ser
 * escritos no servidor.
 */
export function EnterClientButton({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setError(null);
    setPending(true);

    const response = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.message ?? "Não foi possível entrar neste cliente.");
      setPending(false);
      return;
    }

    // Recarregamento completo, e não `router.push`: a identidade da sessão
    // acabou de mudar nos cookies, e o shell inteiro (incluindo a busca de
    // sessão feita no servidor pelo layout) precisa ser refeito com ela. Uma
    // navegação do lado do cliente reaproveitaria o cache do router e
    // deixaria a tela presa no painel anterior.
    window.location.href = "/dashboard";
  }

  return (
    <div className="text-right">
      <button
        onClick={() => void enter()}
        disabled={pending}
        title={`Entrar em ${organizationName}`}
        className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-canvas hover:bg-ink disabled:opacity-50"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
