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
        const falhou = nossa && message.outboundStatus === "FAILED";

        return (
          <li key={message.id} className={nossa ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-corpo leading-relaxed shadow-subtle ${
                falhou
                  ? // Uma mensagem que não saiu não pode ter a mesma cara de uma
                    // entregue: o operador varre a conversa procurando o que
                    // precisa refazer, e a cor é o que a faz saltar.
                    "rounded-br-md bg-red-50 text-red-900 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
                  : nossa
                    ? // Preenchida com o acento, como em qualquer aplicativo de
                      // mensagem: a própria fala é a que se destaca, porque é
                      // ela que se procura para saber onde a conversa parou.
                      // Antes era um tint de dez por cento, que sumia no tema
                      // escuro e ainda deixava a nossa bolha mais apagada que a
                      // do lead, o inverso do que se espera.
                      "rounded-br-md bg-accent text-accent-contrast ring-1 ring-inset ring-accent"
                    : "rounded-bl-md bg-panel-soft text-ink ring-1 ring-inset ring-line/60"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">
                {message.type === "TEXT" ? message.text : "Mensagem não textual"}
              </p>
              {/*
                O carimbo de hora não usa opacidade sobre o acento: texto de
                onze pixels a oitenta por cento cai abaixo do contraste mínimo,
                e o que separa a hora da mensagem aqui é o tamanho, não a cor.
              */}
              <p
                className={`mt-1 text-rotulo ${
                  falhou ? "text-red-700 dark:text-red-200" : nossa ? "text-accent-contrast" : "text-ink-mute"
                }`}
                title={dataCompleta(message.timestamp)}
              >
                {tempoRelativo(message.timestamp)}
                {nossa && message.outboundStatus === "PENDING" ? " · enviando" : null}
                {nossa && message.outboundStatus === "SENT" ? " · enviada" : null}
                {falhou ? " · não entregue" : null}
              </p>
              {falhou ? (
                <p className="mt-1 text-rotulo font-medium text-red-700 dark:text-red-200">
                  {message.sendError}
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
