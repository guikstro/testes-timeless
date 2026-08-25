"use client";

import { useActionState } from "react";
import { createClassificationRule, CreateRuleState } from "./actions";

const initialState: CreateRuleState = {};

export function CreateRuleForm() {
  const [state, formAction, pending] = useActionState(createClassificationRule, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <select
        name="targetStatus"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      >
        <option value="QUALIFIED">Qualifica o lead</option>
        <option value="WON">Marca como venda</option>
      </select>
      <input
        name="phrase"
        placeholder="Frase gatilho, ex: vamos marcar sua consulta"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none sm:col-span-2"
      />
      <div className="flex items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Adicionando..." : "Adicionar gatilho"}
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
