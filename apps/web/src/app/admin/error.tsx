"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { relatarErro } from "@/lib/relatar-erro";

/**
 * Erro dentro da administração.
 *
 * Não existia, e essa ausência tinha consequência: qualquer falha aqui subia
 * até o `global-error`, que troca a interface inteira, ou aparecia como tela
 * de exceção com rastro de pilha. Foi o que aconteceu quando a exigência de
 * segundo fator entrou e a primeira chamada à API passou a ser recusada.
 *
 * A saída daqui é o painel do cliente, e não o dashboard: quem opera a
 * plataforma pode nem ter organização própria, e mandá-lo para uma tela que
 * exige uma seria trocar um beco sem saída por outro.
 */
export default function ErroDaAdministracao({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void relatarErro(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
      <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>

      <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
        Esta tela da administração não carregou
      </h1>
      <p className="mt-2 text-corpo leading-relaxed text-ink-soft">
        O problema já foi registrado. Nada do que os clientes usam foi afetado.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>Tentar de novo</Button>
        <Link
          href="/admin"
          className="focus-ring inline-flex h-11 items-center rounded-full px-4 text-corpo font-medium text-ink-soft transition-colors hover:text-ink"
        >
          Voltar para os clientes
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 text-rotulo text-ink-mute">
          Código para o suporte:{" "}
          <code className="rounded bg-panel-soft px-1.5 py-0.5 font-mono text-ink-soft">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
