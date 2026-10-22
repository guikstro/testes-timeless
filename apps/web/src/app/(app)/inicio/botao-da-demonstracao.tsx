"use client";

import { useState, useTransition } from "react";
import { abreDemonstracao } from "../clientes/actions";

/** Prepara a empresa de exemplo (pode levar alguns segundos na primeira vez do dia) e entra nela. */
export function BotaoDaDemonstracao() {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const resultado = await abreDemonstracao();
            if ("error" in resultado) setErro(resultado.error);
            else window.location.assign(resultado.destino);
          })
        }
        className="focus-ring rounded-full bg-accent px-4 py-2 text-corpo font-semibold text-accent-contrast transition-[filter] hover:brightness-110 disabled:opacity-60"
      >
        {pendente ? "Preparando a demonstração" : "Abrir a demonstração"}
      </button>
      {erro ? <span className="text-apoio text-danger">{erro}</span> : null}
    </div>
  );
}
