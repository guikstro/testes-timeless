"use client";

import { useActionState } from "react";
import { updateLead, UpdateLeadState } from "./actions";

const initialState: UpdateLeadState = {};

export function ManualEditForm({ leadId, status }: { leadId: string; status: "NEW" | "QUALIFIED" | "WON" }) {
  const action = updateLead.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <select
        name="status"
        defaultValue=""
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      >
        <option value="">Manter status atual</option>
        {status === "NEW" ? <option value="QUALIFIED">Marcar como Qualificado</option> : null}
        {status !== "WON" ? <option value="WON">Marcar como Venda</option> : null}
      </select>
      <input
        name="revenueReais"
        placeholder="Receita em R$ (opcional)"
        inputMode="decimal"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar correção"}
      </button>
      {state.error ? <p className="text-sm text-red-600 sm:col-span-3">{state.error}</p> : null}
    </form>
  );
}
