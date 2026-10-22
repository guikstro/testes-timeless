"use client";

import { useState, useTransition } from "react";
import { entra } from "./actions";

/** Entra no cliente para ver o sistema como ele vê. A navegação completa é o que grava a sessão do cliente. */
export function BotaoEntrar({ organizationId, nome }: { organizationId: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pendente}
        aria-label={`Entrar em ${nome}`}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const resultado = await entra(organizationId);
            if ("error" in resultado) setErro(resultado.error);
            else window.location.assign(resultado.destino);
          })
        }
        className="focus-ring rounded-full border border-line bg-panel px-3.5 py-1.5 text-apoio font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
      >
        {pendente ? "Entrando" : "Entrar"}
      </button>
      {erro ? <span className="mt-1 text-rotulo text-danger">{erro}</span> : null}
    </span>
  );
}
