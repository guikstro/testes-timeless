import { cn } from "@/lib/cn";

/** Placeholder com brilho passando — mostra que algo está vindo, não que travou. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,theme(colors.slate.100),theme(colors.slate.200),theme(colors.slate.100))]",
        className,
      )}
    />
  );
}

/** Vazio com voz: diz o que aconteceu e qual é o próximo passo. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-rise-in flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-panel-soft text-ink-mute">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-ink-mute">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
