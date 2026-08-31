import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Superfície do produto.
 *
 * `interactive` só deve ser usado quando o card inteiro leva a algum lugar —
 * um card que sobe ao passar o mouse e não faz nada é uma promessa quebrada.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "surface",
        interactive &&
          "cursor-pointer transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-slate-300/70 hover:shadow-lifted",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
