import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Os estados de uma área da tela que não são "o conteúdo": vazio e erro.
 * Carregando é o `Skeleton`, com a forma do que vai chegar.
 */

/** Vazio com voz: diz o que aconteceu e qual é o próximo passo. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-rise-in flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-panel-soft text-ink-mute">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-destaque font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-corpo text-ink-mute">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/**
 * Uma parte da tela que não carregou, sem derrubar o resto.
 *
 * Fala a língua de quem usa ("não carregou"), nunca o código do erro, e
 * sempre oferece a saída: tentar de novo. Para a tela inteira há o
 * `error.tsx` do aplicativo; este é para um bloco dentro dela.
 */
export function ErrorState({
  title = "Esta parte não carregou",
  description = "Pode ter sido uma falha passageira. Tente de novo em instantes.",
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  /** Normalmente um botão "Tentar de novo". */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <p className="font-display text-destaque font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-corpo text-ink-mute">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
