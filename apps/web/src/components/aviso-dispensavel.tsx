"use client";

import { ReactNode, useState } from "react";
import { COOKIE_DOS_AVISOS, comDispensado } from "@/lib/avisos-dispensados";

/** Um ano: fechado é fechado, até a situação mudar. */
const UM_ANO_EM_SEGUNDOS = 365 * 24 * 60 * 60;

function leCookie(nome: string): string | null {
  const achado = document.cookie.split("; ").find((parte) => parte.startsWith(`${nome}=`));
  return achado ? achado.slice(nome.length + 1) : null;
}

/**
 * Um aviso com X para fechar.
 *
 * Some na hora, e o cookie faz o servidor não desenhá-lo de novo nas
 * próximas telas. O aviso continua dito em versão curta no topo da tela
 * ("Sem WhatsApp conectado"), então fechar a faixa não esconde a situação.
 */
export function AvisoDispensavel({ chave, children }: { chave: string; children: ReactNode }) {
  const [fechado, setFechado] = useState(false);
  if (fechado) return null;

  function fecha() {
    document.cookie = `${COOKIE_DOS_AVISOS}=${comDispensado(leCookie(COOKIE_DOS_AVISOS), chave)}; path=/; max-age=${UM_ANO_EM_SEGUNDOS}; SameSite=Lax`;
    setFechado(true);
  }

  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={fecha}
        aria-label="Fechar este aviso"
        title="Fechar este aviso"
        className="focus-ring absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-warning/80 transition-colors duration-200 ease-soft hover:bg-ink/[0.06] hover:text-warning"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
