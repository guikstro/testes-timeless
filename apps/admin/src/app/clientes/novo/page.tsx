"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { criaCliente, NovoClienteState } from "../actions";

const inicial: NovoClienteState = {};

export default function NovoClientePage() {
  const [state, formAction, pending] = useActionState(criaCliente, inicial);

  return (
    <div className="max-w-lg">
      <Link href="/" className="text-sm text-ink-mute hover:text-ink">
        ← Clientes
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Novo cliente</h1>
      <p className="mt-1 text-sm text-ink-mute">
        Cria só a conta do cliente. Depois, na página dele, gere o link para conectar o WhatsApp.
      </p>

      <form action={formAction} className="mt-6 rounded-xl border border-line bg-panel p-4">
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="nome">
          Nome do cliente
        </label>
        <input
          id="nome"
          name="nome"
          required
          minLength={2}
          maxLength={80}
          autoFocus
          placeholder="Ex.: Clínica Sorriso"
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
        <Button type="submit" loading={pending} className="mt-4">
          {pending ? "Criando..." : "Criar cliente"}
        </Button>
      </form>
    </div>
  );
}
