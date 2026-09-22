"use client";

import { useState, useTransition } from "react";
import { mudarStatusDoAnuncio } from "./controle-actions";

/**
 * Pausar e reativar um criativo direto daqui.
 *
 * Pausar pede confirmação em dois toques; reativar não.
 *
 * A assimetria é deliberada e não é sobre reversibilidade: as duas ações são
 * reversíveis com um clique. É sobre o que cada erro custa enquanto dura.
 * Pausar sem querer o anúncio que traz os leads para a conversa durante uma
 * reunião de meia hora, e ninguém percebe. Reativar sem querer custa alguns
 * reais e aparece no extrato do dia.
 */
export function BotaoDePausa({
  externalId,
  nome,
  pausado,
}: {
  externalId: string;
  nome: string;
  pausado: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, iniciar] = useTransition();

  function agir(acao: "pausar" | "ativar") {
    setErro(null);
    iniciar(async () => {
      const resultado = await mudarStatusDoAnuncio(externalId, acao);
      setConfirmando(false);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  if (erro) {
    return (
      <span className="flex items-center justify-end gap-2">
        {/*
          O motivo fica na tela, e não num alerta que some. "Falta
          ads_management no token" tem conserto, e quem lê precisa poder
          copiar isso para quem configura a conta.
        */}
        <span className="max-w-[16rem] text-right text-apoio leading-snug text-red-700 dark:text-red-300">
          {erro}
        </span>
        <button
          type="button"
          onClick={() => setErro(null)}
          className="focus-ring shrink-0 rounded-lg px-2 py-1 text-apoio text-ink-mute transition-colors hover:text-ink"
        >
          Fechar
        </button>
      </span>
    );
  }

  if (pausado) {
    return (
      <button
        type="button"
        disabled={executando}
        onClick={() => agir("ativar")}
        className="focus-ring rounded-lg px-2.5 py-1 text-apoio font-medium text-accent transition-colors hover:bg-brand-soft disabled:opacity-60"
      >
        {executando ? "Ativando" : "Ativar"}
      </button>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="focus-ring rounded-lg px-2.5 py-1 text-apoio text-ink-mute transition-colors hover:bg-panel-soft hover:text-ink"
        aria-label={`Pausar o anúncio ${nome}`}
      >
        Pausar
      </button>
    );
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={executando}
        onClick={() => agir("pausar")}
        className="focus-ring rounded-lg px-2.5 py-1 text-apoio font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60 dark:text-amber-400 dark:hover:bg-amber-950/40"
      >
        {executando ? "Pausando" : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="focus-ring rounded-lg px-2 py-1 text-apoio text-ink-mute transition-colors hover:text-ink"
      >
        Não
      </button>
    </span>
  );
}
