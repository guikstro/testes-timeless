"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { rotuloDaArea } from "@/lib/areas";
import { removePessoa } from "../actions";

export interface PessoaDoCliente {
  userId: string;
  nome: string;
  email: string;
  papel: "OWNER" | "ADMIN" | "MEMBER";
  areas: string[];
}

/** Quem tem acesso a este cliente. Remover tira o acesso na hora, em todos os aparelhos. */
export function PessoasDoCliente({ organizationId, pessoas }: { organizationId: string; pessoas: PessoaDoCliente[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remover = (pessoa: PessoaDoCliente) => {
    if (!window.confirm(`Tirar o acesso de ${pessoa.nome} a este cliente?`)) return;
    startTransition(async () => {
      setErro(null);
      const resultado = await removePessoa(organizationId, pessoa.userId);
      if (resultado.error) setErro(resultado.error);
    });
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-ink-mute">Pessoas com acesso</h2>

      {pessoas.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Ninguém além da equipe Timeless.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/70">
          {pessoas.map((pessoa) => (
            <li key={pessoa.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{pessoa.nome}</p>
                <p className="text-xs text-ink-mute">{pessoa.email}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {pessoa.papel === "MEMBER" ? pessoa.areas.map(rotuloDaArea).join(", ") || "Nenhuma área" : "Acesso a tudo"}
                </p>
              </div>
              <Button type="button" variant="danger" size="sm" onClick={() => remover(pessoa)} disabled={pending}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}
      <p className="mt-4 text-xs text-ink-mute">
        Para dar acesso a alguém, use{" "}
        <Link href="/settings?aba=equipe" className="underline underline-offset-4 hover:text-ink">
          Configurações → Equipe → Adicionar pessoa
        </Link>
        .
      </p>
    </section>
  );
}
