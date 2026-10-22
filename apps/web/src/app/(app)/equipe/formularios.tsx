"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { defineQuemAtende, EstadoDoFormulario, revogaAcesso, salvaPessoaDaEquipe } from "./actions";

const inicial: EstadoDoFormulario = {};

export function AdicionaPessoa() {
  const [estado, acao, pendente] = useActionState(salvaPessoaDaEquipe, inicial);
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
      <Field label="E-mail da pessoa" hint="Ela precisa já ter uma conta. Dar acesso não cria cadastro nem senha.">
        {(id) => <Input id={id} name="email" type="email" required placeholder="nome@timeless.com.br" />}
      </Field>
      <Field label="Nível">
        {(id) => (
          <Select id={id} name="role" defaultValue="SUPPORT">
            <option value="SUPPORT">Operador: atende os clientes dele</option>
            <option value="ADMIN">Sócio: vê tudo e cuida da equipe</option>
          </Select>
        )}
      </Field>
      <Button type="submit" loading={pendente}>
        {pendente ? "Salvando" : "Dar acesso"}
      </Button>
      {estado.error ? <p className="text-apoio text-danger sm:col-span-3">{estado.error}</p> : null}
      {estado.ok ? <p className="text-apoio text-success sm:col-span-3">Acesso salvo.</p> : null}
    </form>
  );
}

export function RevogaAcesso({ userId, nome }: { userId: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pendente}
        aria-label={`Revogar o acesso de ${nome}`}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const resultado = await revogaAcesso(userId);
            if (resultado.error) setErro(resultado.error);
          })
        }
        className="focus-ring rounded-full border border-line px-3 py-1 text-apoio text-ink-soft hover:text-danger disabled:opacity-60"
      >
        {pendente ? "Revogando" : "Revogar acesso"}
      </button>
      {erro ? <span className="mt-1 text-rotulo text-danger">{erro}</span> : null}
    </span>
  );
}

/** Na página do cliente: quem da equipe o atende. Só o sócio altera. */
export function QuemAtende({
  organizationId,
  operadores,
  marcados,
  podeAlterar,
}: {
  organizationId: string;
  operadores: { id: string; name: string; email: string }[];
  marcados: string[];
  podeAlterar: boolean;
}) {
  const [escolhidos, setEscolhidos] = useState(new Set(marcados));
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  if (!podeAlterar) {
    const nomes = operadores.filter((o) => marcados.includes(o.id)).map((o) => o.name);
    return <p className="text-corpo text-ink-soft">{nomes.length ? nomes.join(", ") : "Ninguém da equipe atende este cliente ainda."}</p>;
  }
  if (operadores.length === 0) {
    return <p className="text-corpo text-ink-mute">Ainda não há operadores na equipe. Dê acesso a alguém em Equipe e sócios.</p>;
  }

  return (
    <div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {operadores.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-corpo text-ink-soft hover:text-ink">
              <input
                type="checkbox"
                checked={escolhidos.has(o.id)}
                onChange={() =>
                  setEscolhidos((atual) => {
                    const novo = new Set(atual);
                    if (novo.has(o.id)) novo.delete(o.id);
                    else novo.add(o.id);
                    return novo;
                  })
                }
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              <span>
                {o.name}
                <span className="block text-rotulo text-ink-mute">{o.email}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          loading={pendente}
          onClick={() =>
            iniciar(async () => {
              setMensagem(null);
              const resultado = await defineQuemAtende(organizationId, [...escolhidos]);
              setMensagem(resultado.error ? { tipo: "erro", texto: resultado.error } : { tipo: "ok", texto: "Salvo." });
            })
          }
        >
          Salvar quem atende
        </Button>
        {mensagem ? <span className={`text-apoio ${mensagem.tipo === "ok" ? "text-success" : "text-danger"}`}>{mensagem.texto}</span> : null}
      </div>
      <p className="mt-2 text-rotulo text-ink-mute">Sócios veem todos os clientes e não precisam ser marcados.</p>
    </div>
  );
}
