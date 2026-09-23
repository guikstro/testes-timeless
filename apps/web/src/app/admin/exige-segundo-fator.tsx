import Link from "next/link";

/**
 * Tela para o operador que ainda não configurou a verificação em duas etapas.
 *
 * A recusa é proposital: a administração enxerga todos os clientes e entra em
 * qualquer um deles, e é a única parte do produto onde o segundo fator é
 * obrigatório. O que estava errado era a apresentação. A exigência nova fez a
 * página estourar com rastro de pilha, que é a pior forma de comunicar uma
 * regra com saída conhecida.
 *
 * Mesma forma do aviso de impersonação, e pelo mesmo motivo: situação prevista
 * merece tela, não exceção.
 */
export function ExigeSegundoFator({ pendente }: { pendente: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="surface animate-rise-in w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>

        <h1 className="font-display text-lg font-semibold tracking-tight text-ink">
          A administração exige verificação em duas etapas
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Daqui se enxerga todos os clientes e se entra em qualquer um deles. É a única parte do sistema onde a
          senha sozinha não basta.
          {pendente ? " Você começou a configuração e não chegou a confirmar o código." : ""}
        </p>

        <Link
          href="/settings?aba=seguranca"
          className="focus-ring mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-corpo font-medium text-accent-contrast transition-opacity hover:opacity-90"
        >
          {pendente ? "Concluir a configuração" : "Configurar agora"}
        </Link>

        {/* O resto do produto continua acessível: a exigência é desta porta,
            não da conta. */}
        <Link
          href="/dashboard"
          className="focus-ring mt-3 inline-block rounded text-apoio text-ink-mute underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
