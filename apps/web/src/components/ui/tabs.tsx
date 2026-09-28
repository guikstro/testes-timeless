"use client";

import { ReactNode, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Abas que trocam o conteúdo **dentro** da tela, sem mudar o endereço.
 *
 * Para abas que são páginas (Configurações → Equipe), use `GrupoDePilulas`
 * com `href`: aí a aba vai para o endereço, dá para compartilhar o link e o
 * voltar do navegador funciona. As duas têm a mesma aparência de propósito.
 *
 * Teclado como o padrão ARIA: setas trocam de aba, Home e End vão às pontas,
 * e só a aba ativa entra no Tab.
 */
export interface Aba {
  chave: string;
  rotulo: ReactNode;
  conteudo: ReactNode;
}

export function Tabs({
  abas,
  inicial,
  aoTrocar,
  className,
}: {
  abas: Aba[];
  inicial?: string;
  aoTrocar?: (chave: string) => void;
  className?: string;
}) {
  const base = useId();
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.chave);
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);

  function vai(indice: number) {
    const i = (indice + abas.length) % abas.length;
    setAtiva(abas[i].chave);
    aoTrocar?.(abas[i].chave);
    botoes.current[i]?.focus();
  }

  const indiceAtivo = Math.max(
    0,
    abas.findIndex((aba) => aba.chave === ativa),
  );

  return (
    <div className={className}>
      <div
        role="tablist"
        className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-panel-soft/60 p-1"
        onKeyDown={(evento) => {
          if (evento.key === "ArrowRight") vai(indiceAtivo + 1);
          else if (evento.key === "ArrowLeft") vai(indiceAtivo - 1);
          else if (evento.key === "Home") vai(0);
          else if (evento.key === "End") vai(abas.length - 1);
          else return;
          evento.preventDefault();
        }}
      >
        {abas.map((aba, i) => {
          const selecionada = i === indiceAtivo;
          return (
            <button
              key={aba.chave}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${aba.chave}`}
              aria-selected={selecionada}
              aria-controls={`${base}-painel-${aba.chave}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => vai(i)}
              className={cn(
                "focus-ring inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-3.5",
                "text-apoio font-medium transition-all duration-200 ease-soft active:scale-95",
                selecionada ? "bg-ink text-canvas shadow-subtle" : "text-ink-soft hover:bg-ink/[0.06] hover:text-ink",
              )}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>
      {abas.map((aba, i) => (
        <div
          key={aba.chave}
          role="tabpanel"
          id={`${base}-painel-${aba.chave}`}
          aria-labelledby={`${base}-aba-${aba.chave}`}
          hidden={i !== indiceAtivo}
          tabIndex={0}
          className="mt-5 focus:outline-none"
        >
          {i === indiceAtivo ? aba.conteudo : null}
        </div>
      ))}
    </div>
  );
}
