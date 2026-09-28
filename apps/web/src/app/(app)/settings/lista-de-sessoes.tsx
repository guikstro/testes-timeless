"use client";

import { useState, useTransition } from "react";
import { encerrarOutrasSessoes, encerrarSessao } from "./sessoes-actions";
import { InlineConfirm } from "@/components/ui/inline-confirm";

export interface Sessao {
  id: string;
  aparelho: string;
  movel: boolean;
  ip: string | null;
  criadaEm: string;
  ultimaAtividadeEm: string;
  atual: boolean;
  visita: boolean;
}

/**
 * Onde a conta está aberta agora.
 *
 * A sessão atual vem primeiro e sem botão de encerrar: é a aba onde a pessoa
 * está, e encerrá-la por aqui a deixaria sem sessão no meio da ação. As outras
 * vêm depois, da mais recente para a mais antiga, que é a ordem em que alguém
 * procura "o que é isso que eu não reconheço".
 */
export function ListaDeSessoes({ sessoes }: { sessoes: Sessao[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const atual = sessoes.find((s) => s.atual);
  const outras = sessoes.filter((s) => !s.atual);

  async function encerrarTodas() {
    setErro(null);
    setAviso(null);
    const resultado = await encerrarOutrasSessoes();
    if (resultado.erro) return { erro: resultado.erro };
    setAviso(
      resultado.encerradas === 1 ? "Uma sessão foi encerrada." : `${resultado.encerradas} sessões foram encerradas.`,
    );
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-line/70 rounded-2xl border border-line">
        {atual ? <Linha sessao={atual} /> : null}
        {outras.map((sessao) => (
          <Linha key={sessao.id} sessao={sessao} aoErro={setErro} />
        ))}
      </ul>

      {outras.length === 0 ? (
        <p className="text-apoio text-ink-mute">Esta é a única sessão aberta na sua conta.</p>
      ) : null}

      {erro ? <p className="text-apoio text-danger">{erro}</p> : null}
      {aviso ? <p role="status" className="text-apoio text-ink-soft">{aviso}</p> : null}

      {/*
        O botão de quem desconfia de alguma coisa. Pede confirmação porque
        derruba outros aparelhos da própria pessoa também, e ela pode estar
        com o celular no bolso logado.
      */}
      {outras.length > 0 ? (
        <InlineConfirm
          aparencia="contorno"
          pergunta={`Encerrar ${outras.length === 1 ? "a outra sessão" : `as outras ${outras.length} sessões`}?`}
          rotuloConfirmar="Encerrar"
          rotuloPendente="Encerrando"
          aoConfirmar={encerrarTodas}
        >
          Encerrar todas as outras sessões
        </InlineConfirm>
      ) : null}
    </div>
  );
}

function Linha({ sessao, aoErro }: { sessao: Sessao; aoErro?: (erro: string | null) => void }) {
  const [encerrando, iniciar] = useTransition();

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel-soft text-ink-mute" aria-hidden>
          {sessao.movel ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]">
              <rect x="7" y="2" width="10" height="20" rx="2" />
              <path d="M11 18h2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" strokeLinecap="round" />
            </svg>
          )}
        </span>

        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-corpo font-medium text-ink">
            {sessao.aparelho}
            {sessao.atual ? (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-rotulo font-semibold uppercase tracking-[0.1em] text-brand-ink">
                Esta sessão
              </span>
            ) : null}
            {sessao.visita ? (
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-rotulo font-semibold uppercase tracking-[0.1em] text-warning">
                Visita de suporte
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-apoio text-ink-mute">
            {/*
              "Ativa" com a granularidade real. A atividade é registrada na
              renovação, a cada quinze minutos, e dizer "agora" para algo visto
              há doze minutos seria fingir uma precisão que não existe.
            */}
            {sessao.atual ? "Ativa agora" : `Ativa ${quando(sessao.ultimaAtividadeEm)}`}
            {sessao.ip ? ` · ${sessao.ip}` : ""}
            {` · aberta em ${dataCurta(sessao.criadaEm)}`}
          </p>
        </div>
      </div>

      {!sessao.atual ? (
        <button
          type="button"
          disabled={encerrando}
          onClick={() =>
            iniciar(async () => {
              aoErro?.(null);
              const resultado = await encerrarSessao(sessao.id);
              if (resultado.erro) aoErro?.(resultado.erro);
            })
          }
          className="focus-ring rounded-lg px-3 py-1.5 text-apoio font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
          aria-label={`Encerrar a sessão de ${sessao.aparelho}`}
        >
          {encerrando ? "Encerrando" : "Encerrar"}
        </button>
      ) : null}
    </li>
  );
}

/** "há pouco", "há 3 horas", "há 2 dias": com a folga de quinze minutos embutida. */
function quando(iso: string): string {
  const minutos = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (minutos < 20) return "há pouco";
  if (minutos < 60 * 24) {
    const horas = Math.max(1, Math.round(minutos / 60));
    return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  }
  const dias = Math.round(minutos / 60 / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
}
