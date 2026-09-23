"use client";

import { useActionState, useState, useTransition } from "react";
import { OperatorFormState, revokeOperator, upsertOperator } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: OperatorFormState = {};

export function AddOperatorForm() {
  const [state, formAction, pending] = useActionState(upsertOperator, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-line bg-panel p-4">
      <p className="mb-3 text-sm text-ink-mute">
        A pessoa precisa já ter uma conta na plataforma. Promover não cria cadastro nem define senha.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="pessoa@suaempresa.com"
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="role">
            Nível
          </label>
          <select
            id="role"
            name="role"
            defaultValue="SUPPORT"
            className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="SUPPORT">Suporte (entra nos clientes)</option>
            <option value="ADMIN">Administrador (também gerencia operadores)</option>
          </select>
        </div>
        <Button type="submit" loading={pending}>{pending ? "Salvando..." : "Salvar"}</Button>
      </div>
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function RevokeOperatorButton({ userId, name }: { userId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await revokeOperator(userId);
            if (result.error) setError(result.error);
          })
        }
        disabled={pending}
        title={`Revogar acesso de ${name}`}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-panel-soft disabled:opacity-50"
      >
        {pending ? "Revogando..." : "Revogar"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
