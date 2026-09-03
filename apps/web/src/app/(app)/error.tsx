"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { relatarErro } from "@/lib/relatar-erro";

/**
 * Erro dentro do aplicativo.
 *
 * Fica no grupo `(app)` de propósito: assim o menu e a faixa do topo
 * continuam de pé, e a pessoa sai daqui por conta própria em vez de encarar
 * uma página branca sem saída. Antes qualquer erro caía direto no
 * `global-error`, que substitui a interface inteira.
 *
 * E relata o erro em vez de só exibi-lo: o que quebra para o cliente e
 * ninguém fica sabendo é o pior tipo de defeito.
 */
export default function ErroDoApp({
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

      <h1 className="font-display text-xl font-semibold tracking-tight text-ink">Esta tela não carregou</h1>
      <p className="mt-2 text-corpo leading-relaxed text-ink-soft">
        O problema já foi registrado do nosso lado, você não precisa avisar. O resto do sistema continua
        funcionando.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>Tentar de novo</Button>
        <Link
          href="/dashboard"
          className="focus-ring inline-flex h-11 items-center rounded-full px-4 text-corpo font-medium text-ink-soft transition-colors hover:text-ink"
        >
          Ir para o dashboard
        </Link>
      </div>

      {/*
        O código só aparece quando existe. Um rótulo "código: vazio" faria a
        pessoa procurar o que não há, e ela vai ler isto por telefone.
      */}
      {error.digest ? (
        <p className="mt-6 text-rotulo text-ink-mute">
          Se precisar falar com o suporte, informe o código{" "}
          <code className="rounded bg-panel-soft px-1.5 py-0.5 font-mono text-ink-soft">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
