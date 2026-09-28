"use client";

import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Aviso passageiro do resultado de uma ação: "Link copiado", "Verba salva".
 *
 * Só para confirmação e falha de algo que a pessoa acabou de fazer. O que
 * chega sozinho (lead novo, WhatsApp caiu) é notificação e tem o sino; o que
 * precisa ficar na tela é `Alert`. Fica embaixo, no centro, para não disputar
 * o canto das notificações.
 */
type Tom = "success" | "danger" | "info";

interface Aviso {
  id: number;
  tom: Tom;
  texto: ReactNode;
}

interface Contexto {
  avisa: (texto: ReactNode, tom?: Tom) => void;
}

const ToastContext = createContext<Contexto | null>(null);

/** Quanto o aviso fica, e mais um pouco para falha, que costuma pedir releitura. */
const DURACAO: Record<Tom, number> = { success: 3500, info: 4500, danger: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximo = useRef(1);

  const tira = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const avisa = useCallback((texto: ReactNode, tom: Tom = "success") => {
    const id = proximo.current++;
    // No máximo três: uma pilha maior vira ruído, e o mais antigo já foi lido.
    setAvisos((lista) => [...lista.slice(-2), { id, tom, texto }]);
  }, []);

  return (
    <ToastContext.Provider value={{ avisa }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
      >
        {avisos.map((aviso) => (
          <Item key={aviso.id} aviso={aviso} aoSumir={tira} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Item({ aviso, aoSumir }: { aviso: Aviso; aoSumir: (id: number) => void }) {
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    const timer = setTimeout(() => aoSumir(aviso.id), DURACAO[aviso.tom]);
    return () => clearTimeout(timer);
  }, [aoSumir, aviso.id, aviso.tom, pausado]);

  return (
    <div
      role={aviso.tom === "danger" ? "alert" : "status"}
      // Parar o relógio com o mouse em cima: quem está lendo não perde o texto no meio.
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className={cn(
        "glass pointer-events-auto flex w-full max-w-sm animate-rise-in items-center gap-3 rounded-2xl px-4 py-3 text-corpo text-ink",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          aviso.tom === "success" ? "bg-success" : aviso.tom === "danger" ? "bg-danger" : "bg-info",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">{aviso.texto}</span>
      <button
        type="button"
        onClick={() => aoSumir(aviso.id)}
        aria-label="Fechar aviso"
        className="focus-ring -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-ink/[0.06] hover:text-ink"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
      </button>
    </div>
  );
}

/** `const { avisa } = useToast(); avisa("Link copiado")`. */
export function useToast(): Contexto {
  const contexto = useContext(ToastContext);
  // Fora do provedor (uma página pública, um teste) o aviso só não aparece,
  // em vez de derrubar a tela por causa de um enfeite.
  return contexto ?? { avisa: () => undefined };
}
