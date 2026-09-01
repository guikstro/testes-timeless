"use client";

import { useEffect, useRef } from "react";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "OTHER";
  text: string | null;
  timestamp: string;
  outboundStatus: "PENDING" | "SENT" | "FAILED" | null;
  sendError: string | null;
}

/**
 * Lista de mensagens, ancorada no fim.
 *
 * A ordem cronológica está certa (a mais antiga em cima), mas abrir no topo
 * mostra o começo de uma conversa que pode ter meses. Quem abre um lead quer
 * ver o que foi dito por último, então a rolagem começa embaixo.
 *
 * Sem animação na primeira pintura: rolar suavemente até o fim ao abrir faria
 * a tela deslizar sozinha na cara de quem chegou.
 */
export function Conversation({ messages }: { messages: Message[] }) {
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <ol className="-mx-1 flex-1 space-y-2.5 overflow-y-auto px-1">
      {messages.map((message) => {
        const nossa = message.direction === "OUTBOUND";
        return (
          <li key={message.id} className={nossa ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-subtle ${
                nossa
                  ? "rounded-br-md bg-accent/10 text-ink ring-1 ring-inset ring-accent/20"
                  : "rounded-bl-md bg-panel-soft text-ink ring-1 ring-inset ring-line/60"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">
                {message.type === "TEXT" ? message.text : "Mensagem não textual"}
              </p>
              <p className="mt-1 text-[11px] text-ink-mute" title={dataCompleta(message.timestamp)}>
                {tempoRelativo(message.timestamp)}
                {nossa && message.outboundStatus === "PENDING" ? " · enviando" : null}
                {nossa && message.outboundStatus === "SENT" ? " · enviada" : null}
              </p>
              {nossa && message.outboundStatus === "FAILED" ? (
                <p className="mt-1 text-[11.5px] text-red-600 dark:text-red-400">
                  Falha no envio: {message.sendError}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
      {messages.length === 0 ? (
        <li className="py-10 text-center text-sm text-ink-mute">Nenhuma mensagem ainda.</li>
      ) : null}
      <div ref={fim} />
    </ol>
  );
}
