"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessage, SendMessageState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: SendMessageState = {};

export function ReplyBox({
  leadId,
  disabledReason,
  aoEnviar,
  compacta = false,
}: {
  leadId: string;
  disabledReason: string | null;
  /**
   * Chamado quando a mensagem entrou na fila. A ficha do lead não precisa
   * disto, porque é uma página de servidor e o `revalidatePath` já a
   * atualiza; a caixa de entrada troca de conversa sem recarregar e precisa
   * do aviso para buscar as mensagens de novo.
   */
  aoEnviar?: () => void;
  /** Sem margem no topo e em uma linha só, para caber no rodapé da caixa. */
  compacta?: boolean;
}) {
  const sendForLead = sendMessage.bind(null, leadId);
  const [state, formAction, pending] = useActionState(sendForLead, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const avisado = useRef<number | undefined>(undefined);

  // Limpa o campo só quando o envio deu certo — um erro precisa preservar o
  // texto para o usuário não perder o que escreveu.
  useEffect(() => {
    if (!state.sentAt) return;
    formRef.current?.reset();
    // `sentAt` é o carimbo do envio: comparar evita avisar de novo a cada
    // render enquanto o mesmo estado continuar em pé.
    if (avisado.current !== state.sentAt) {
      avisado.current = state.sentAt;
      aoEnviar?.();
    }
  }, [state.sentAt, aoEnviar]);

  if (disabledReason) {
    return (
      <p className={`rounded-lg border border-dashed border-line p-3 text-sm text-ink-mute ${compacta ? "" : "mt-4"}`}>
        {disabledReason}
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className={compacta ? "space-y-2" : "mt-4 space-y-2"}>
      <div className={compacta ? "flex items-end gap-2" : "space-y-2"}>
        <textarea
          name="text"
          rows={compacta ? 1 : 3}
          required
          maxLength={4096}
          placeholder="Escreva uma resposta..."
          className={`focus-ring w-full resize-none border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-mute ${
            compacta ? "min-h-[2.75rem] rounded-2xl bg-panel-soft/60" : "rounded-md"
          }`}
        />
        <div className={compacta ? "shrink-0" : "flex items-center gap-3"}>
          <Button type="submit" loading={pending}>{pending ? "Enviando..." : "Enviar"}</Button>
          {!compacta && state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        </div>
      </div>
      {compacta && state.error ? (
        <p className="text-[12.5px] text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
    </form>
  );
}
