"use client";

import { useActionState } from "react";
import { createTrackingLink, CreateLinkState } from "./actions";

const initialState: CreateLinkState = {};

export function CreateLinkForm() {
  const [state, formAction, pending] = useActionState(createTrackingLink, initialState);

  return (
    <form
      action={formAction}
      className="mb-8 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input
        name="name"
        placeholder="Nome do link"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <input
        name="destinationUrl"
        placeholder="https://wa.me/5585999999999"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <input
        name="defaultSource"
        placeholder="Origem (opcional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <input
        name="defaultCampaign"
        placeholder="Campanha (opcional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Criando..." : "Criar link"}
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
