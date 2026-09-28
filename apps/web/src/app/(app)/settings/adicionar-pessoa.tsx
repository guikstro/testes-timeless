"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { BotaoCopiar } from "@/components/ui/copy-button";
import { AREAS } from "@/lib/areas";
import { convida, ConviteState } from "./convite-actions";
import { Input, Select } from "@/components/ui/input";

const inicial: ConviteState = {};

/**
 * Convida alguém para a equipe Timeless (acesso a tudo) ou para um cliente,
 * só nas áreas marcadas. Quem confere as áreas de verdade é a API; aqui é só
 * a escolha.
 */
export function AdicionarPessoa({ clientes }: { clientes: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(convida, inicial);
  const [acesso, setAcesso] = useState<"timeless" | "cliente">("cliente");

  return (
    <div>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-corpo font-medium text-ink-soft">
            E-mail da pessoa
          </label>
          <Input id="email" name="email" type="email" required placeholder="pessoa@empresa.com" />
        </div>

        <fieldset>
          <legend className="mb-1 text-corpo font-medium text-ink-soft">Acesso</legend>
          <div className="flex flex-wrap gap-4 text-corpo text-ink">
            <label className="flex items-center gap-2">
              <input type="radio" name="acesso" value="cliente" checked={acesso === "cliente"} onChange={() => setAcesso("cliente")} />
              Um cliente, em áreas escolhidas
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="acesso" value="timeless" checked={acesso === "timeless"} onChange={() => setAcesso("timeless")} />
              Equipe Timeless (acesso a tudo)
            </label>
          </div>
        </fieldset>

        {acesso === "cliente" ? (
          <>
            <div>
              <label htmlFor="organizationId" className="mb-1 block text-corpo font-medium text-ink-soft">
                Cliente
              </label>
              <Select id="organizationId" name="organizationId" required defaultValue="">
                <option value="" disabled>
                  Escolha o cliente
                </option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.name}
                  </option>
                ))}
              </Select>
            </div>
            <fieldset>
              <legend className="mb-1 text-corpo font-medium text-ink-soft">O que a pessoa pode usar</legend>
              <div className="grid grid-cols-2 gap-2 text-corpo text-ink sm:grid-cols-3">
                {AREAS.map((area) => (
                  <label key={area.chave} className="flex items-center gap-2">
                    <input type="checkbox" name="areas" value={area.chave} />
                    {area.rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : (
          <p className="text-apoio text-ink-mute">A pessoa vê todos os clientes e pode convidar outras pessoas.</p>
        )}

        {state.error ? <p className="text-corpo text-danger">{state.error}</p> : null}
        <Button type="submit" loading={pending}>
          {pending ? "Gerando..." : "Gerar convite"}
        </Button>
      </form>

      {state.convite ? (
        <div className="mt-5 rounded-md border border-line bg-panel-soft p-3" aria-live="polite">
          <p className="text-corpo text-ink-soft">
            Envie este link para {state.convite.email}. Vale até{" "}
            {new Date(state.convite.expiraEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} e uma vez só.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input readOnly value={state.convite.url} aria-label="Link do convite" className="text-apoio" />
            <BotaoCopiar texto={state.convite.url} rotulo="Copiar link do convite" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
