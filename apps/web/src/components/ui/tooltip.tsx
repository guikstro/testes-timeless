"use client";

import { ReactElement, ReactNode, cloneElement, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Explicação curta de um elemento, ao passar o mouse **ou** ao chegar nele
 * pelo teclado. Nunca guarda nada essencial: no celular não há "passar o
 * mouse", então o que a pessoa precisa saber para agir fica escrito na tela.
 *
 * Substitui o `title=` nativo, que demora a aparecer, não aparece no foco e
 * o leitor de tela lê de jeitos diferentes em cada navegador.
 */
export function Tooltip({
  conteudo,
  children,
  lado = "cima",
}: {
  conteudo: ReactNode;
  /** Um único elemento focável (botão, link). */
  children: ReactElement<{ "aria-describedby"?: string }>;
  lado?: "cima" | "baixo";
}) {
  const id = useId();
  const [visivel, setVisivel] = useState(false);
  const [desvio, setDesvio] = useState(0);
  const balao = useRef<HTMLSpanElement>(null);

  /*
    Centrada no elemento, mas sem sair da área de conteúdo: perto da borda,
    ela escorrega para dentro. Sem isso, a dica de um botão encostado à
    esquerda some por baixo do menu lateral.
  */
  useLayoutEffect(() => {
    if (!visivel || !balao.current) return;
    const caixa = balao.current.getBoundingClientRect();
    const area = balao.current.closest("main")?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
    const margem = 8;
    const centro = caixa.left - desvio;
    const esquerda = area.left + margem - centro;
    const direita = area.right - margem - (centro + caixa.width);
    setDesvio(esquerda > 0 ? esquerda : direita < 0 ? direita : 0);
    // Só ao abrir: medir de novo com o desvio aplicado entraria em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onFocus={() => setVisivel(true)}
      onBlur={() => setVisivel(false)}
      onKeyDown={(evento) => {
        if (evento.key === "Escape") setVisivel(false);
      }}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span
        ref={balao}
        id={id}
        role="tooltip"
        style={{ transform: `translateX(calc(-50% + ${desvio}px))` }}
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-[16rem] rounded-lg bg-ink px-2.5 py-1.5",
          "text-rotulo font-medium leading-snug text-canvas shadow-pop transition-opacity duration-150",
          lado === "cima" ? "bottom-full mb-2" : "top-full mt-2",
          visivel ? "opacity-100" : "opacity-0",
        )}
      >
        {conteudo}
      </span>
    </span>
  );
}
