"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { definePaginaDaMeta, leiaPaginaDaMeta, PaginaDaMetaState, tiraPaginaDaMeta } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inicial: PaginaDaMetaState = {};

/**
 * A Página do Facebook dos Insights: escolher, ler agora e tirar.
 *
 * O campo é controlado e o envio passa por `onSubmit`: com a ação ligada
 * direto no formulário, o React 19 limpa o campo depois de enviar, e quem
 * errou um dígito perderia o que digitou junto com a mensagem de erro.
 */
export function PaginaDaMetaForm({ paginaId }: { paginaId: string | null }) {
  const [estado, formAction, salvando] = useActionState(definePaginaDaMeta, inicial);
  const [valor, setValor] = useState(paginaId ?? "");
  const [lendo, iniciaLeitura] = useTransition();
  const [tirando, iniciaRetirada] = useTransition();

  return (
    <div className="space-y-3">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          const dados = new FormData(evento.currentTarget);
          startTransition(() => formAction(dados));
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-corpo font-medium text-ink-soft" htmlFor="paginaId">
            Id da Página
          </label>
          <Input
            id="paginaId"
            name="paginaId"
            inputMode="numeric"
            placeholder="226094994111312"
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
          />
        </div>
        <Button type="submit" loading={salvando}>
          {salvando ? "Salvando" : paginaId ? "Trocar a Página" : "Usar esta Página"}
        </Button>
        {paginaId ? (
          <>
            <Button type="button" variant="secondary" loading={lendo} onClick={() => iniciaLeitura(() => leiaPaginaDaMeta())}>
              {lendo ? "Pedindo" : "Ler agora"}
            </Button>
            <button
              type="button"
              disabled={tirando}
              onClick={() => iniciaRetirada(() => tiraPaginaDaMeta())}
              className="focus-ring rounded-lg px-2 py-2 text-apoio font-medium text-ink-soft underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              {tirando ? "Tirando" : "Tirar a Página"}
            </button>
          </>
        ) : null}
      </form>
      {estado.error ? <p className="text-corpo text-danger">{estado.error}</p> : null}
      {estado.ok && !salvando ? (
        <p className="text-corpo text-ink-soft">
          Página salva. A leitura dos últimos três meses começou e leva alguns instantes; depois, a Página é lida de
          hora em hora.
        </p>
      ) : null}
    </div>
  );
}
