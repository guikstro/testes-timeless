"use client";

import { InputHTMLAttributes, ReactNode, forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Marcar, escolher uma entre várias e ligar ou desligar.
 *
 * Os três são o `<input>` nativo por baixo, com a aparência trocada: o
 * navegador continua cuidando de teclado, formulário e leitor de tela, e o
 * produto só decide como fica. Rótulo sempre junto e clicável, porque um
 * quadradinho de 16 pixels sozinho é um alvo que o dedo erra.
 */

type Nativo = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children">;

interface ComRotulo {
  children: ReactNode;
  /** Uma linha de explicação embaixo do rótulo. */
  descricao?: ReactNode;
}

const MARCADOR =
  "peer relative shrink-0 cursor-pointer appearance-none border border-line shadow-subtle " +
  "transition-all duration-200 ease-soft " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-45";

function Linha({
  id,
  controle,
  children,
  descricao,
  className,
}: ComRotulo & { id: string; controle: ReactNode; className?: string }) {
  return (
    <label htmlFor={id} className={cn("group flex cursor-pointer items-start gap-2.5", className)}>
      <span className="relative mt-0.5 inline-flex">{controle}</span>
      <span className="min-w-0">
        <span className="block text-corpo text-ink">{children}</span>
        {descricao ? <span className="mt-0.5 block text-apoio text-ink-mute">{descricao}</span> : null}
      </span>
    </label>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, Nativo & ComRotulo>(function Checkbox(
  { children, descricao, className, id: idDado, ...props },
  ref,
) {
  const gerado = useId();
  const id = idDado ?? gerado;
  return (
    <Linha
      id={id}
      descricao={descricao}
      className={className}
      controle={
        <>
          <input ref={ref} id={id} type="checkbox" className={cn(MARCADOR, "h-4 w-4 rounded-[5px] bg-panel checked:border-ink checked:bg-ink")} {...props} />
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute inset-0 h-4 w-4 text-canvas opacity-0 transition-opacity peer-checked:opacity-100"
            aria-hidden
          >
            <path d="m4 8.5 2.5 2.5L12 5.5" />
          </svg>
        </>
      }
    >
      {children}
    </Linha>
  );
});

export const Radio = forwardRef<HTMLInputElement, Nativo & ComRotulo>(function Radio(
  { children, descricao, className, id: idDado, ...props },
  ref,
) {
  const gerado = useId();
  const id = idDado ?? gerado;
  return (
    <Linha
      id={id}
      descricao={descricao}
      className={className}
      controle={
        <>
          <input ref={ref} id={id} type="radio" className={cn(MARCADOR, "h-4 w-4 rounded-full bg-panel checked:border-ink checked:bg-ink")} {...props} />
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas opacity-0 transition-opacity peer-checked:opacity-100"
            aria-hidden
          />
        </>
      }
    >
      {children}
    </Linha>
  );
});

/** Várias opções, uma escolha. O `fieldset` dá ao grupo o nome que o leitor de tela anuncia. */
export function RadioGroup({
  legenda,
  children,
  className,
  horizontal = false,
}: {
  legenda: ReactNode;
  children: ReactNode;
  className?: string;
  horizontal?: boolean;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-corpo font-medium text-ink-soft">{legenda}</legend>
      <div className={cn("flex gap-x-5 gap-y-2.5", horizontal ? "flex-wrap" : "flex-col")}>{children}</div>
    </fieldset>
  );
}

/**
 * Ligar e desligar algo que vale na hora, sem botão de salvar. Para escolha
 * que só vale ao enviar um formulário, use `Checkbox`: o interruptor promete
 * efeito imediato. `role="switch"` para o leitor de tela dizer "ligado".
 */
export const Switch = forwardRef<HTMLInputElement, Nativo & ComRotulo>(function Switch(
  { children, descricao, className, id: idDado, ...props },
  ref,
) {
  const gerado = useId();
  const id = idDado ?? gerado;
  return (
    <Linha
      id={id}
      descricao={descricao}
      className={className}
      controle={
        <>
          <input
            ref={ref}
            id={id}
            type="checkbox"
            role="switch"
            className={cn(MARCADOR, "h-5 w-9 rounded-full bg-panel-soft checked:border-accent checked:bg-accent")}
            {...props}
          />
          <span
            className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-panel shadow-subtle ring-1 ring-line/60 transition-transform duration-200 ease-soft peer-checked:translate-x-4 peer-checked:ring-0"
            aria-hidden
          />
        </>
      }
    >
      {children}
    </Linha>
  );
});
