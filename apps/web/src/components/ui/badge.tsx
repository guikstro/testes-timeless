import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Estado em forma, não só em cor: cada tom vem com rótulo escrito, para o
 * significado não depender de o leitor distinguir as cores.
 */
type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-panel-soft text-ink-soft ring-line/60",
  info: "bg-info-soft text-info ring-info-line/70",
  success: "bg-success-soft text-success ring-success-line/70",
  warning: "bg-warning-soft text-warning ring-warning-line/70",
  danger: "bg-danger-soft text-danger ring-danger-line/70",
  brand: "bg-brand-soft text-brand-ink ring-brand/20",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-rotulo font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}
