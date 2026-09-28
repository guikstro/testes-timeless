"use client";

import { useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { transferirPosse } from "./team-actions";

/**
 * Passar a posse da conta da equipe para outra pessoa da equipe.
 *
 * Só aparece para o dono, na conta da equipe, e só lista quem já é da equipe:
 * a posse desta conta abre todos os clientes e nunca vai para um cliente. O
 * código do autenticador confirma; quem transfere passa a administrador.
 */
export function TransferirPosse({ candidatos }: { candidatos: { userId: string; name: string; email: string }[] }) {
  const [userId, setUserId] = useState(candidatos[0]?.userId ?? "");
  const [codigo, setCodigo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (candidatos.length === 0) {
    return (
      <p className="text-apoio text-ink-mute">
        Ainda não há outra pessoa da equipe nesta conta. Convide alguém em Adicionar pessoa, com Equipe Timeless, e
        depois volte aqui.
      </p>
    );
  }

  const escolhido = candidatos.find((c) => c.userId === userId);

  function transferir(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resultado = await transferirPosse(userId, codigo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setCodigo("");
      setConfirmando(false);
    });
  }

  return (
    <form onSubmit={transferir} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Novo dono">
          {(id) => (
            <Select
              id={id}
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setConfirmando(false);
              }}
              disabled={pendente}
            >
              {candidatos.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Código do autenticador" hint="Os seis dígitos do app, ou um código de recuperação.">
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={32}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              disabled={pendente}
            />
          )}
        </Field>
      </div>

      {erro ? (
        <p role="alert" className="text-apoio text-danger">
          {erro}
        </p>
      ) : null}

      {confirmando ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-apoio text-ink-soft">
            {escolhido?.name} vira dono e você passa a administrador. Só um dono desfaz isso.
          </p>
          <Button type="submit" loading={pendente} size="sm">
            {pendente ? "Transferindo" : "Confirmar transferência"}
          </Button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="focus-ring rounded-full px-2 py-1 text-rotulo text-ink-mute transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={() => setConfirmando(true)} disabled={codigo.trim().length < 6}>
          Transferir a posse
        </Button>
      )}
    </form>
  );
}
