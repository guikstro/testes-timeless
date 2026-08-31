import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * O botão do produto.
 *
 * As variantes existem para que "qual botão uso aqui" seja uma pergunta de
 * hierarquia, não de estilo: `primary` é a ação da tela, `secondary` acompanha,
 * `ghost` é navegação, `danger` destrói algo.
 *
 * O feedback de pressão (`active:scale-[0.98]`) é o que faz o clique parecer
 * físico. É sutil de propósito — exagerar vira brinquedo.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-slate-900 text-white shadow-subtle hover:bg-slate-800 hover:shadow-card active:bg-slate-900 disabled:hover:bg-slate-900",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-subtle hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // `aria-busy` em vez de só trocar o texto: um leitor de tela anuncia o
      // estado sem depender de a legenda ter mudado.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex select-none items-center justify-center rounded-xl font-medium",
        "transition-all duration-200 ease-soft active:scale-[0.98] active:duration-75",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
