"use client";

import Link from "next/link";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Menu de ações que abre de um botão: "mais opções" de uma linha, por exemplo.
 *
 * Teclado completo, como o padrão ARIA de menu: Enter ou seta para baixo
 * abre e foca o primeiro item, setas andam, Esc fecha e devolve o foco ao
 * botão, Tab sai. Clique fora fecha.
 */
export interface ItemDoMenu {
  rotulo: ReactNode;
  /** Ação. Excludente com `href`. */
  aoEscolher?: () => void;
  href?: string;
  /** Ação destrutiva, em vermelho e por último por convenção. */
  perigoso?: boolean;
  desabilitado?: boolean;
}

export function DropdownMenu({
  rotulo,
  itens,
  alinhar = "fim",
  className,
}: {
  /** O conteúdo do botão que abre. Se for só ícone, passe `aria-label` pelo texto escondido. */
  rotulo: ReactNode;
  itens: ItemDoMenu[];
  alinhar?: "inicio" | "fim";
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const itensRef = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!aberto) return;
    function fora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function foca(indice: number) {
    const habilitados = itens.map((item, i) => (item.desabilitado ? -1 : i)).filter((i) => i >= 0);
    if (habilitados.length === 0) return;
    const alvo = habilitados[(indice + habilitados.length) % habilitados.length];
    itensRef.current[alvo]?.focus();
  }

  function abre() {
    setAberto(true);
    requestAnimationFrame(() => foca(0));
  }

  function fecha() {
    setAberto(false);
    botao.current?.focus();
  }

  function teclaNoMenu(evento: React.KeyboardEvent) {
    const atual = itensRef.current.findIndex((el) => el === document.activeElement);
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      foca(atual + 1);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      foca(atual - 1);
    } else if (evento.key === "Home") {
      evento.preventDefault();
      foca(0);
    } else if (evento.key === "End") {
      evento.preventDefault();
      foca(itens.length - 1);
    } else if (evento.key === "Escape") {
      evento.preventDefault();
      fecha();
    } else if (evento.key === "Tab") {
      setAberto(false);
    }
  }

  const classeDoItem = (item: ItemDoMenu) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-corpo outline-none transition-colors",
      "focus:bg-ink/[0.06] hover:bg-ink/[0.06] disabled:pointer-events-none disabled:opacity-45",
      item.perigoso ? "text-danger" : "text-ink",
    );

  return (
    <div ref={raiz} className={cn("relative inline-flex", className)}>
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => (aberto ? setAberto(false) : abre())}
        onKeyDown={(evento) => {
          if (evento.key === "ArrowDown") {
            evento.preventDefault();
            abre();
          }
        }}
        className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-corpo font-medium text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink"
      >
        {rotulo}
      </button>
      {aberto ? (
        <div
          id={id}
          role="menu"
          onKeyDown={teclaNoMenu}
          className={cn(
            "animate-pop-in absolute top-full z-40 mt-1.5 min-w-[12rem] rounded-xl border border-line/70 bg-panel p-1 shadow-pop",
            alinhar === "fim" ? "right-0" : "left-0",
          )}
        >
          {itens.map((item, i) =>
            item.href ? (
              <Link
                key={i}
                ref={(el) => {
                  itensRef.current[i] = el;
                }}
                href={item.href}
                role="menuitem"
                tabIndex={-1}
                onClick={() => setAberto(false)}
                className={classeDoItem(item)}
              >
                {item.rotulo}
              </Link>
            ) : (
              <button
                key={i}
                ref={(el) => {
                  itensRef.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.desabilitado}
                onClick={() => {
                  fecha();
                  item.aoEscolher?.();
                }}
                className={classeDoItem(item)}
              >
                {item.rotulo}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
