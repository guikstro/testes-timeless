"use client";

import { useActionState } from "react";
import { createTrackingLink, CreateLinkState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: CreateLinkState = {};

export function CreateLinkForm() {
  const [state, formAction, pending] = useActionState(createTrackingLink, initialState);

  return (
    <form
      action={formAction}
      className="mb-8 grid grid-cols-1 gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input
        name="name"
        placeholder="Nome do link"
        required
        className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <input
        name="destinationUrl"
        placeholder="https://wa.me/5585999999999"
        required
        className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <input
        name="defaultSource"
        placeholder="Origem (opcional)"
        className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <input
        name="defaultCampaign"
        placeholder="Campanha (opcional)"
        className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" loading={pending}>{pending ? "Criando..." : "Criar link"}</Button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
