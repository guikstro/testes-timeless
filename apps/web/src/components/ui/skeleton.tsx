import { cn } from "@/lib/cn";

/**
 * Bloco com brilho passando: diz que algo está vindo, não que travou.
 *
 * As cores saem das variáveis de superfície, e não de uma paleta cinza fixa.
 * Com `slate` cravado, o bloco aparecia claro sobre o fundo quase preto do
 * tema escuro, que é o oposto de um espaço vazio esperando conteúdo.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,rgb(var(--panel-soft)),rgb(var(--line)),rgb(var(--panel-soft)))]",
        className,
      )}
    />
  );
}

/**
 * O esqueleto de uma tela comum: título, uma fileira de números e uma lista.
 *
 * Serve para o app inteiro porque quase toda tela daqui tem essa silhueta. O
 * ponto não é adivinhar o conteúdo, é o espaço não pular quando ele chega, e
 * a navegação responder na hora em vez de parecer que o clique se perdeu.
 */
export function PaginaEsqueleto() {
  return (
    <div className="animate-rise-in">
      <Skeleton className="h-7 w-52" />
      <Skeleton className="mt-2 h-4 w-80" />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-6 w-28" />
          </div>
        ))}
      </div>

      <div className="surface mt-5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-1.5 h-3 w-64" />
            </div>
            <Skeleton className="h-3.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Uma linha de conversa na caixa de entrada, enquanto a lista não chega. */
export function LinhaDeConversaEsqueleto() {
  return (
    <div className="flex gap-2.5 border-b border-line/50 px-3.5 py-3">
      <Skeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-1.5 h-3 w-44" />
      </div>
    </div>
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
      <p className="font-display text-destaque font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-corpo text-ink-mute">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
