import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * O botão do produto.
 *
 * As variantes existem por hierarquia, não por estilo: `primary` é a ação da
 * tela, `secondary` acompanha, `ghost` é navegação, `danger` destrói algo.
 *
 * Três detalhes fazem o clique parecer físico, e nenhum deles é decoração:
 *
 * - O recuo ao pressionar é curto (75ms) na descida e longo na volta. Invertido
 *   parece borracha; assim parece toque.
 * - A luz interna no topo (`before`) imita superfície iluminada de cima, que é
 *   de onde o olho espera luz. Sem ela o botão é um retângulo chapado.
 * - A sombra cresce no hover em vez de a cor mudar sozinha: o botão se
 *   aproxima, e a profundidade carrega o estado.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-canvas shadow-subtle hover:shadow-card " +
    "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-canvas/25",
  accent:
    "bg-accent text-accent-contrast shadow-subtle hover:shadow-card hover:brightness-[1.06] " +
    "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/30",
  secondary:
    "border border-line bg-panel text-ink shadow-subtle hover:border-ink/25 hover:shadow-card",
  ghost: "text-ink-soft hover:bg-ink/[0.06] hover:text-ink",
  danger: "border border-red-300/60 bg-panel text-red-600 hover:border-red-400 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-3.5 text-[13px]",
  md: "h-11 gap-2 px-5 text-sm",
  lg: "h-13 gap-2.5 px-6 text-[15px]",
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
      // `aria-busy` em vez de só trocar a legenda: o leitor de tela anuncia o
      // estado sem depender de o texto ter mudado.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "focus-ring relative isolate inline-flex select-none items-center justify-center overflow-hidden",
        "rounded-full font-medium transition-[transform,box-shadow,background-color,border-color,filter]",
        "duration-300 ease-soft active:scale-[0.97] active:duration-75",
        "disabled:pointer-events-none disabled:opacity-45",
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
    <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
