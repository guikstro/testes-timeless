import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Estado em forma, não só em cor: cada tom vem com rótulo escrito, para o
 * significado não depender de o leitor distinguir as cores.
 */
type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200/60",
  info: "bg-blue-50 text-blue-700 ring-blue-200/60",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  warning: "bg-amber-50 text-amber-800 ring-amber-200/60",
  danger: "bg-red-50 text-red-700 ring-red-200/60",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}
