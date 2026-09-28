"use client";

import { ReactNode, useState, useTransition } from "react";
import { cn } from "@/lib/cn";

/**
 * Confirmação no lugar do próprio botão, em dois toques: "Remover" vira
 * "Confirmar / Cancelar" ali mesmo.
 *
 * É o padrão do produto para ação que não se desfaz mas cabe numa linha
 * (remover alguém, apagar uma verba, pausar um anúncio). Uma janela custaria
 * o mesmo clique e interromperia mais, e se fecha no reflexo. Quando a
 * consequência precisa de um parágrafo para ser entendida, use
 * `ConfirmationDialog`.
 *
 * O erro fica no lugar, e não num aviso que some: "falta permissão no token"
 * tem conserto, e quem lê precisa poder copiar.
 */
type Tom = "danger" | "warning";

const TOM: Record<Tom, string> = {
  danger: "text-danger hover:bg-danger-soft",
  warning: "text-warning hover:bg-warning-soft",
};

const APARENCIA = {
  /** Texto discreto, para ações dentro de tabelas e listas densas. */
  texto: "rounded-lg px-2 py-1 text-apoio text-ink-mute hover:bg-panel-soft hover:text-ink",
  /** Contorno, quando a ação precisa ser vista sem chamar atenção demais. */
  contorno:
    "rounded-full border border-line px-3 py-1 text-rotulo font-medium text-ink-soft hover:border-danger/50 hover:text-danger",
};

export function InlineConfirm({
  children,
  aoConfirmar,
  tom = "danger",
  aparencia = "texto",
  rotuloConfirmar = "Confirmar",
  rotuloPendente,
  rotuloCancelar = "Cancelar",
  pergunta,
  "aria-label": ariaLabel,
  className,
}: {
  /** O rótulo do botão antes de confirmar, como "Remover". */
  children: ReactNode;
  /** Devolve `{ erro }` para mostrar no lugar; qualquer outra coisa encerra. */
  aoConfirmar: () => Promise<{ erro?: string } | void> | { erro?: string } | void;
  tom?: Tom;
  aparencia?: keyof typeof APARENCIA;
  rotuloConfirmar?: string;
  /** Enquanto executa, como "Removendo". */
  rotuloPendente?: string;
  rotuloCancelar?: string;
  /** Uma frase antes dos botões, quando o botão sozinho não diz o que vai acontecer. */
  pergunta?: ReactNode;
  "aria-label"?: string;
  /** Classe do contêiner, para alinhar na linha. Não muda a aparência dos botões. */
  className?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await aoConfirmar();
      setConfirmando(false);
      if (resultado && resultado.erro) setErro(resultado.erro);
    });
  }

  const botao = "focus-ring shrink-0 transition-colors disabled:opacity-60";

  if (erro) {
    return (
      <span role="alert" className={cn("inline-flex items-center gap-2", className)}>
        <span className="max-w-[16rem] text-apoio leading-snug text-danger">{erro}</span>
        <button type="button" onClick={() => setErro(null)} className={cn(botao, APARENCIA.texto)}>
          Fechar
        </button>
      </span>
    );
  }

  if (!confirmando) {
    return (
      <span className={cn("inline-flex", className)}>
        <button type="button" onClick={() => setConfirmando(true)} aria-label={ariaLabel} className={cn(botao, APARENCIA[aparencia])}>
          {children}
        </button>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {pergunta ? <span className="text-apoio text-ink-soft">{pergunta}</span> : null}
      <button
        type="button"
        disabled={pendente}
        aria-busy={pendente || undefined}
        onClick={confirmar}
        className={cn(botao, "rounded-lg px-2.5 py-1 text-apoio font-medium", TOM[tom])}
      >
        {pendente ? (rotuloPendente ?? rotuloConfirmar) : rotuloConfirmar}
      </button>
      {/* O foco vai para Cancelar: um Enter apressado não confirma nada. */}
      <button type="button" autoFocus onClick={() => setConfirmando(false)} className={cn(botao, "rounded-lg px-2 py-1 text-apoio text-ink-mute hover:text-ink")}>
        {rotuloCancelar}
      </button>
    </span>
  );
}
