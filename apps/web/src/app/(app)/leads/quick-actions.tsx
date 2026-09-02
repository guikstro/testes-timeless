"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverEstagio, responderRapido } from "./actions";
import { Estagio, ORDEM } from "./estagios";

/**
 * Ações rápidas do cartão.
 *
 * Aparecem no hover para não poluir a leitura da fila, mas ficam sempre
 * presentes no DOM e alcançáveis por teclado: esconder por opacidade preserva
 * a ordem de foco, enquanto montar só no hover tornaria o cartão inoperável
 * para quem navega por Tab.
 */
export function QuickActions({
  leadId,
  status,
  nome,
  onOcupado,
}: {
  leadId: string;
  status: Estagio;
  nome: string;
  onOcupado: (ocupado: boolean) => void;
}) {
  const router = useRouter();
  const [compondo, setCompondo] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const caixa = useRef<HTMLTextAreaElement>(null);

  // Enquanto a caixa está aberta, o quadro não pode se recarregar por baixo
  // e apagar o que a pessoa está escrevendo.
  useEffect(() => {
    onOcupado(compondo);
    return () => onOcupado(false);
  }, [compondo, onOcupado]);

  useEffect(() => {
    if (compondo) caixa.current?.focus();
  }, [compondo]);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await responderRapido(leadId, texto);
      if (resultado?.error) {
        setErro(resultado.error);
        return;
      }
      setTexto("");
      setCompondo(false);
      router.refresh();
    });
  }

  function marcarReuniao() {
    setErro(null);
    iniciar(async () => {
      const resultado = await moverEstagio(leadId, "MEETING_SCHEDULED");
      if (resultado?.error) setErro(resultado.error);
      else router.refresh();
    });
  }

  const podeMarcarReuniao = ORDEM[status] < ORDEM.MEETING_SCHEDULED;

  if (compondo) {
    return (
      <div
        className="mt-2.5 rounded-xl border border-line bg-panel p-2"
        // O cartão inteiro é um link: sem isto, clicar na caixa navegaria.
        onClick={(evento) => evento.preventDefault()}
      >
        <textarea
          ref={caixa}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") setCompondo(false);
            // Enter envia, Shift+Enter quebra linha: é a convenção de toda
            // caixa de conversa, e contrariá-la faria a pessoa mandar sem querer.
            if (evento.key === "Enter" && !evento.shiftKey) {
              evento.preventDefault();
              enviar();
            }
          }}
          rows={2}
          placeholder={`Responder ${nome.split(" ")[0]}`}
          className="w-full resize-none rounded-lg border border-line bg-canvas px-2.5 py-2 text-apoio text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
        />
        {erro ? <p className="mt-1 text-rotulo text-red-600 dark:text-red-400">{erro}</p> : null}
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={enviar}
            disabled={pendente || !texto.trim()}
            className="focus-ring rounded-lg bg-accent px-3 py-1.5 text-apoio font-medium text-accent-contrast transition-all duration-200 hover:brightness-105 active:scale-95 disabled:opacity-40"
          >
            {pendente ? "Enviando" : "Enviar"}
          </button>
          <button
            type="button"
            onClick={() => setCompondo(false)}
            className="focus-ring rounded-lg px-2.5 py-1.5 text-apoio text-ink-mute transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-2.5 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 ease-soft group-hover:opacity-100 group-focus-within:opacity-100"
      onClick={(evento) => evento.preventDefault()}
    >
      <button
        type="button"
        onClick={() => setCompondo(true)}
        title="Responder sem abrir o lead"
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1 text-rotulo text-ink-soft transition-all duration-200 hover:border-accent/40 hover:text-ink active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-4-1L3 21l2.1-5a8.4 8.4 0 01-1-4 8.5 8.5 0 018.4-9 8.5 8.5 0 018.5 8.5z" />
        </svg>
        Responder
      </button>

      {podeMarcarReuniao ? (
        <button
          type="button"
          onClick={marcarReuniao}
          disabled={pendente}
          title="Marcar reunião agendada"
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1 text-rotulo text-ink-soft transition-all duration-200 hover:border-accent/40 hover:text-ink active:scale-95 disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 11h18" />
          </svg>
          Reunião
        </button>
      ) : null}

      {erro ? <span className="text-rotulo text-red-600 dark:text-red-400">{erro}</span> : null}
    </div>
  );
}
