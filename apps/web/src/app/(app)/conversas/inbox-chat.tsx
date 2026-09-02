"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ESTAGIO_ROTULO, ESTAGIO_TOM, FichaDoLead, nomeDoLead } from "@/lib/conversas/tipos";
import { tempoRelativo } from "@/lib/relative-time";
import { Conversation } from "../leads/[id]/conversation";
import { ReplyBox } from "../leads/[id]/reply-box";

/**
 * A coluna do meio.
 *
 * As bolhas e a caixa de resposta são as mesmas da ficha do lead, e não cópias
 * parecidas: status de envio, rolagem ancorada no fim e preservação do texto
 * em caso de erro são comportamentos que levaram tempo para ficar certos, e
 * uma segunda implementação começaria errando de novo.
 */
export function InboxChat({
  ficha,
  carregando,
  motivoParaNaoResponder,
  aoEnviar,
  aoVoltar,
  painelAberto,
  aoAlternarPainel,
}: {
  ficha: FichaDoLead | null;
  carregando: boolean;
  motivoParaNaoResponder: string | null;
  aoEnviar: () => void;
  /** Só aparece no telefone, onde a lista e a conversa não cabem juntas. */
  aoVoltar: () => void;
  painelAberto: boolean;
  aoAlternarPainel: () => void;
}) {
  if (!ficha) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-xs text-center text-[13px] leading-relaxed text-ink-mute">
          {carregando ? "Abrindo a conversa…" : "Escolha uma conversa à esquerda para ler e responder."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line/60 bg-panel/60 px-4 py-2.5 backdrop-blur-xl">
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Voltar para a lista"
          // Só no telefone: a partir do tablet a lista está ao lado, e um botão de
          // voltar para algo que já está à vista confunde mais do que ajuda.
          className="focus-ring -ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{nomeDoLead(ficha)}</p>
          <p className="truncate text-[11.5px] tabular-nums text-ink-mute">
            {ficha.normalizedPhone}
            {ficha.metrics.lastMessageAt ? ` · ${tempoRelativo(ficha.metrics.lastMessageAt)}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={ESTAGIO_TOM[ficha.status]}>{ESTAGIO_ROTULO[ficha.status]}</Badge>
          {ficha.disqualifiedAt ? <Badge tone="neutral">Descartado</Badge> : null}

          <button
            type="button"
            onClick={aoAlternarPainel}
            aria-pressed={painelAberto}
            aria-label={painelAberto ? "Esconder painel do lead" : "Mostrar painel do lead"}
            // Vale também no telefone: a gaveta já funciona nesse tamanho, e o
            // contexto do lead ao lado da conversa é a razão de a caixa existir.
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <Conversation messages={ficha.messages} />
      </div>

      <div className="shrink-0 border-t border-line/60 bg-panel/60 px-4 py-3 backdrop-blur-xl">
        {/*
          `key` no lead: trocar de conversa precisa descartar o formulário
          anterior, ou o texto digitado numa conversa apareceria na próxima.
        */}
        <ReplyBox
          key={ficha.id}
          leadId={ficha.id}
          disabledReason={motivoParaNaoResponder}
          aoEnviar={aoEnviar}
          compacta
        />
      </div>
    </div>
  );
}

export function LinkParaFicha({ leadId }: { leadId: string }) {
  return (
    <Link
      href={`/leads/${leadId}`}
      target="_blank"
      className="focus-ring rounded-full px-2 py-1 text-[11.5px] font-medium text-ink-soft transition-colors hover:text-ink"
    >
      Ver ficha completa
    </Link>
  );
}
