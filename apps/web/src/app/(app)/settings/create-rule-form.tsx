"use client";

import { useActionState, useState } from "react";
import { createClassificationRule, CreateRuleState } from "./actions";

const initialState: CreateRuleState = {};

const PLACEHOLDERS: Record<string, string> = {
  QUALIFIED: "Frase gatilho, ex: quero contratar",
  MEETING_SCHEDULED: "Frase gatilho, ex: agendei para",
  WON: "Frase gatilho, ex: contrato fechado",
};

export function CreateRuleForm() {
  const [state, formAction, pending] = useActionState(createClassificationRule, initialState);
  const [target, setTarget] = useState("QUALIFIED");

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-3">
      <select
        name="targetStatus"
        required
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      >
        <option value="QUALIFIED">Qualifica o lead</option>
        <option value="MEETING_SCHEDULED">Marca reunião agendada</option>
        <option value="WON">Marca como venda</option>
      </select>
      <input
        name="phrase"
        placeholder={PLACEHOLDERS[target]}
        required
        className="rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none sm:col-span-2"
      />
      {/*
        Quem cadastra precisa saber disto antes de escolher a frase: é a única
        regra que também lê o que a equipe escreve, e uma frase genérica pode
        disparar numa mensagem de abordagem.
      */}
      {target === "MEETING_SCHEDULED" ? (
        <p className="text-xs text-ink-mute sm:col-span-3">
          Esta é a única regra que também lê as mensagens que <strong>sua equipe</strong> envia. Normalmente é o
          atendente quem diz que agendou. Prefira frases que só apareçam ao confirmar um horário.
        </p>
      ) : null}

      <div className="flex items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-ink disabled:opacity-50"
        >
          {pending ? "Adicionando..." : "Adicionar gatilho"}
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
