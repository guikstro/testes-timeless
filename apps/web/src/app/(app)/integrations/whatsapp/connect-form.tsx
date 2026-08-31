"use client";

import { useActionState } from "react";
import { connectWhatsApp, ConnectWhatsAppState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: ConnectWhatsAppState = {};

export function ConnectWhatsAppForm() {
  const [state, formAction, pending] = useActionState(connectWhatsApp, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="phoneNumberId">
          Phone Number ID
        </label>
        <input
          id="phoneNumberId"
          name="phoneNumberId"
          required
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="displayPhoneNumber">
          Número (exibição)
        </label>
        <input
          id="displayPhoneNumber"
          name="displayPhoneNumber"
          placeholder="+55 85 90000-0000"
          required
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="accessToken">
          Access token (opcional)
        </label>
        <input
          id="accessToken"
          name="accessToken"
          type="password"
          placeholder="Necessário apenas para enviar mensagens, não usado nesta fase"
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={pending}>{pending ? "Conectando..." : "Conectar"}</Button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
