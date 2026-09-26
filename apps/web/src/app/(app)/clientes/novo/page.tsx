"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { criaCliente, NovoClienteState } from "../actions";

const inicial: NovoClienteState = {};

export default function NovoClientePage() {
  const [state, formAction, pending] = useActionState(criaCliente, inicial);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#2563eb");

  return (
    <div className="max-w-lg">
      <Link href="/clientes" className="text-sm text-ink-mute hover:text-ink">
        ← Clientes
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Novo cliente</h1>
      <p className="mt-1 text-sm text-ink-mute">
        Depois, na página do cliente, gere o link para ele conectar o WhatsApp.
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
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Ex.: Clínica Sorriso"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />

        <label className="mb-1 mt-4 block text-sm font-medium text-ink-soft" htmlFor="cor">
          Cor do cliente
        </label>
        <div className="flex items-center gap-3">
          <input
            id="cor"
            name="cor"
            type="color"
            required
            value={cor}
            onChange={(evento) => setCor(evento.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-line bg-panel p-1"
          />
          {/* Prévia de como o cliente aparece no menu. */}
          <span className="flex items-center gap-2 text-sm text-ink">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-bold text-white"
              style={{ backgroundColor: cor }}
            >
              {nome.trim().charAt(0).toUpperCase() || "?"}
            </span>
            {nome.trim() || "Nome do cliente"}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-mute">Cada cliente tem a sua cor: não pode repetir a de outro.</p>

        {state.error ? <p className="mt-3 text-sm text-red-600">{state.error}</p> : null}
        <Button type="submit" loading={pending} className="mt-4">
          {pending ? "Criando..." : "Criar cliente"}
        </Button>
      </form>
    </div>
  );
}
