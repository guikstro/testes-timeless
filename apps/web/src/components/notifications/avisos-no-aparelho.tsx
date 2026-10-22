"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ativarAvisos,
  desativarAvisos,
  EstadoDosAvisos,
  estadoAtual,
  lerPreferencias,
  PreferenciasDoAviso,
  salvarPreferencias,
} from "@/lib/push/avisos-no-aparelho";

/**
 * Liga ou desliga o aviso de mensagem nova neste aparelho, mesmo com o
 * sistema fechado. A permissão é pedida só no clique: pedir ao abrir a página
 * leva o navegador a bloquear o pedido para sempre.
 */
export function AvisosNoAparelho() {
  const [estado, setEstado] = useState<EstadoDosAvisos>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preferencias, setPreferencias] = useState<PreferenciasDoAviso | null>(null);

  useEffect(() => {
    void estadoAtual().then(setEstado);
  }, []);

  useEffect(() => {
    if (estado !== "ativo") {
      setPreferencias(null);
      return;
    }
    void lerPreferencias()
      .then((lidas) => setPreferencias(lidas ?? { leadNovo: true, mensagem: true }))
      .catch(() => setPreferencias({ leadNovo: true, mensagem: true }));
  }, [estado]);

  const trocar = useCallback(
    async (chave: keyof PreferenciasDoAviso) => {
      if (!preferencias) return;
      const novas = { ...preferencias, [chave]: !preferencias[chave] };
      setPreferencias(novas);
      setErro(null);
      try {
        await salvarPreferencias(novas);
      } catch (e) {
        setPreferencias(preferencias);
        setErro(e instanceof Error ? e.message : "Não foi possível salvar a escolha.");
      }
    },
    [preferencias],
  );

  const alternar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      setEstado(estado === "ativo" ? await desativarAvisos() : await ativarAvisos());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar os avisos.");
    } finally {
      setOcupado(false);
    }
  }, [estado]);

  if (estado === "carregando") return null;

  if (estado === "indisponivel") {
    return (
      <p className="border-t border-line px-4 py-2.5 text-rotulo text-ink-mute">
        Para receber avisos neste aparelho, use o Chrome ou o Edge. No iPhone, adicione o sistema à tela inicial.
      </p>
    );
  }

  if (estado === "bloqueado") {
    return (
      <p className="border-t border-line px-4 py-2.5 text-rotulo text-ink-mute">
        Os avisos estão bloqueados neste navegador. Libere as notificações do site nas configurações dele.
      </p>
    );
  }

  return (
    <div className="border-t border-line px-4 py-2.5">
      <button
        type="button"
        onClick={() => void alternar()}
        disabled={ocupado}
        className="focus-ring w-full rounded-full border border-line px-3 py-1.5 text-apoio font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
      >
        {estado === "ativo" ? "Desativar avisos neste aparelho" : "Ativar avisos neste aparelho"}
      </button>
      {estado === "ativo" && preferencias ? (
        <fieldset className="mt-2.5 space-y-1.5">
          <legend className="sr-only">Quais avisos receber neste aparelho</legend>
          <Opcao marcada={preferencias.leadNovo} aoTrocar={() => void trocar("leadNovo")} rotulo="Lead novo" />
          <Opcao marcada={preferencias.mensagem} aoTrocar={() => void trocar("mensagem")} rotulo="Mensagem de lead" />
        </fieldset>
      ) : null}
      {erro ? <p className="mt-1.5 text-rotulo text-danger">{erro}</p> : null}
    </div>
  );
}

function Opcao({ marcada, aoTrocar, rotulo }: { marcada: boolean; aoTrocar: () => void; rotulo: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-apoio text-ink-soft">
      <input type="checkbox" checked={marcada} onChange={aoTrocar} className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" />
      {rotulo}
    </label>
  );
}
