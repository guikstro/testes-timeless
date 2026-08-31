"use client";

import { useActionState, useState, useTransition } from "react";
import { OperatorFormState, revokeOperator, upsertOperator } from "./actions";

const initialState: OperatorFormState = {};

export function AddOperatorForm() {
  const [state, formAction, pending] = useActionState(upsertOperator, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm text-slate-500">
        A pessoa precisa já ter uma conta na plataforma. Promover não cria cadastro nem define senha.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="pessoa@suaempresa.com"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="role">
            Nível
          </label>
          <select
            id="role"
            name="role"
            defaultValue="SUPPORT"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="SUPPORT">Suporte (entra nos clientes)</option>
            <option value="ADMIN">Administrador (também gerencia operadores)</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
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
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        {pending ? "Revogando..." : "Revogar"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
