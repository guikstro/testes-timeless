import {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
} from "react";
import { cn } from "@/lib/cn";

/**
 * A aparência de todo campo do produto. Exportada para o raro controle que não
 * é um `<input>` (um botão que abre uma lista, por exemplo) parecer campo.
 * Sem largura: quem precisa de outra usa esta e põe a sua (ver `cn`).
 */
export const CAMPO_SEM_LARGURA =
  "rounded-xl border border-line bg-panel px-3.5 text-sm text-ink shadow-subtle " +
  "transition-all duration-200 ease-soft placeholder:text-ink-mute " +
  "hover:border-line focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 " +
  "disabled:cursor-not-allowed disabled:bg-panel-soft disabled:text-ink-mute " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15";

/** O campo na largura toda, que é o caso comum dentro de um formulário. */
export const CAMPO = `${CAMPO_SEM_LARGURA} w-full`;

/**
 * Largura e altura padrão só quando quem usa não trouxe as suas: com as duas
 * na lista, venceria a que o Tailwind gera por último, não a pedida (ver `cn`).
 */
function tamanho(className: string | undefined, altura: string): string {
  const pediu = (prefixo: string) => new RegExp(`(^|\\s)${prefixo}-`).test(className ?? "");
  return cn(!pediu("w") && "w-full", !pediu("h") && altura);
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(CAMPO_SEM_LARGURA, tamanho(className, "h-10"), className)} {...props} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    /** Classe do invólucro. `inline-block` para um select estreito, do tamanho do texto. */
    envolucro?: string;
  }
>(function Select({ className, envolucro, children, ...props }, ref) {
  return (
    <span className={cn("relative block", envolucro)}>
      <select
        ref={ref}
        className={cn(CAMPO_SEM_LARGURA, tamanho(className, "h-10"), "cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      {/* A seta some com `appearance-none`; sem ela o campo não parece abrir nada. */}
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
        aria-hidden
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </span>
  );
});

/** Texto longo. Cresce na vertical e só na vertical: largura é do layout. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CAMPO_SEM_LARGURA, tamanho(className, ""), "resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
});

/**
 * Busca. `type="search"` dá o "limpar" nativo no celular e o Esc no teclado;
 * a lupa diz o que o campo faz antes de a pessoa ler o placeholder.
 */
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  function SearchInput({ className, ...props }, ref) {
    return (
      <span className={cn("relative block", className)}>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
          aria-hidden
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3 3" />
        </svg>
        <input ref={ref} type="search" className={cn(CAMPO, "h-10 pl-9")} {...props} />
      </span>
    );
  },
);

/** O que o `Field` repassa ao campo para ligar rótulo, dica e erro a ele. */
export interface LigacaoDoCampo {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * Rótulo, dica e erro de um campo.
 *
 * Rótulo ligado por id gerado, não por posição visual: sem o `for`, clicar no
 * rótulo não foca o campo e o leitor de tela anuncia um campo sem nome. A dica
 * e o erro também vão para o campo (`aria-describedby`), senão quem não vê a
 * tela preenche sem saber que o campo está errado.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (id: string, ligacao: LigacaoDoCampo) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const idDaNota = `${id}-nota`;
  const temNota = Boolean(error || hint);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-corpo font-medium text-ink-soft">
        {label}
      </label>
      {children(id, {
        ...(temNota ? { "aria-describedby": idDaNota } : {}),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {error ? (
        <p id={idDaNota} className="animate-fade-in text-apoio text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={idDaNota} className="text-apoio text-ink-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
