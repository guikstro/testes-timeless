"use client";

import { useActionState } from "react";
import { connectMeta, ConnectMetaState } from "./actions";

const initialState: ConnectMetaState = {};

export function ConnectMetaForm() {
  const [state, formAction, pending] = useActionState(connectMeta, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="adAccountId">
          Ad Account ID
        </label>
        <input
          id="adAccountId"
          name="adAccountId"
          placeholder="act_1234567890"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="accessToken">
          Access token
        </label>
        <input
          id="accessToken"
          name="accessToken"
          type="password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Conectando..." : "Conectar"}
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
