"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessage, SendMessageState } from "./actions";

const initialState: SendMessageState = {};

export function ReplyBox({ leadId, disabledReason }: { leadId: string; disabledReason: string | null }) {
  const sendForLead = sendMessage.bind(null, leadId);
  const [state, formAction, pending] = useActionState(sendForLead, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa o campo só quando o envio deu certo — um erro precisa preservar o
  // texto para o usuário não perder o que escreveu.
  useEffect(() => {
    if (state.sentAt) formRef.current?.reset();
  }, [state.sentAt]);

  if (disabledReason) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-line p-3 text-sm text-ink-mute">
        {disabledReason}
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-2">
      <textarea
        name="text"
        rows={3}
        required
        maxLength={4096}
        placeholder="Escreva uma resposta..."
        className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-ink disabled:opacity-50"
        >
          {pending ? "Enviando..." : "Enviar"}
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
