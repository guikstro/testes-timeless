"use client";

import Link from "next/link";
import { tempoRelativo } from "@/lib/relative-time";
import { formatCentsAsBRL } from "@/lib/currency";
import { attributionSourceLabel, AttributionSummary } from "@/lib/attribution";

export interface LeadCartao {
  id: string;
  name: string | null;
  normalizedPhone: string;
  status: "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";
  disqualifiedAt: string | null;
  lastContactAt: string;
  attribution: AttributionSummary | null;
  sale: { amountCents: number | null } | null;
  lastMessage: { text: string | null; direction: "INBOUND" | "OUTBOUND"; timestamp: string } | null;
  awaitingReply: boolean;
}

/**
 * Cor derivada do nome, estável entre recarregamentos.
 *
 * Não é enfeite: numa coluna de cartões parecidos, a mancha de cor é o que o
 * olho usa para reencontrar um lead depois de rolar. Precisa ser sempre a
 * mesma para a pessoa, então sai de uma soma dos caracteres e não de sorteio.
 */
const TONS = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function tomDoNome(nome: string): string {
  let soma = 0;
  for (let i = 0; i < nome.length; i += 1) soma += nome.charCodeAt(i);
  return TONS[soma % TONS.length];
}

export function LeadCard({
  lead,
  indice,
  arrastavel,
  onArrastar,
}: {
  lead: LeadCartao;
  indice: number;
  arrastavel: boolean;
  onArrastar: (id: string) => void;
}) {
  const nome = lead.name?.trim() || "Sem nome";
  const inicial = nome.charAt(0).toUpperCase();

  return (
    <li
      draggable={arrastavel}
      onDragStart={(evento) => {
        evento.dataTransfer.effectAllowed = "move";
        // Alguns navegadores só iniciam o arraste se houver dado no evento.
        evento.dataTransfer.setData("text/plain", lead.id);
        onArrastar(lead.id);
      }}
      // A entrada escalonada dá vida ao carregamento sem custar leitura: o
      // atraso é curto e para no oitavo cartão, senão o fim da coluna demora.
      className="animate-rise-in"
      style={{ animationDelay: `${Math.min(indice, 8) * 45}ms` }}
    >
      <Link
        href={`/leads/${lead.id}`}
        className="focus-ring group relative block overflow-hidden rounded-2xl border border-line bg-panel p-3.5 shadow-subtle transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lifted active:scale-[0.99]"
      >
        {/* Halo na cor da marca, revelado sob o ponteiro. */}
        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-soft group-hover:opacity-100 [background:radial-gradient(120%_80%_at_50%_-20%,rgb(var(--accent)/0.12),transparent)]" />

        <div className="relative flex items-start gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold ${tomDoNome(nome)}`}
            aria-hidden
          >
            {inicial}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink">{nome}</p>
            <p className="truncate text-[11.5px] tabular-nums text-ink-mute">{lead.normalizedPhone}</p>
          </div>

          {lead.sale?.amountCents ? (
            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">
              {formatCentsAsBRL(lead.sale.amountCents)}
            </span>
          ) : null}
        </div>

        {lead.lastMessage?.text ? (
          <p className="relative mt-2.5 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">
            {lead.lastMessage.direction === "OUTBOUND" ? (
              <span className="text-ink-mute">Você: </span>
            ) : null}
            {lead.lastMessage.text}
          </p>
        ) : null}

        <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {lead.awaitingReply ? (
            /*
              Transforma a lista em fila de trabalho: o tempo de espera é a
              informação que decide o que fazer primeiro.
            */
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              Espera {tempoRelativo(lead.lastMessage!.timestamp).replace("há ", "")}
            </span>
          ) : (
            <span className="text-[11px] text-ink-mute">{tempoRelativo(lead.lastContactAt)}</span>
          )}

          {lead.disqualifiedAt ? (
            <span className="rounded-full bg-panel-soft px-2 py-0.5 text-[11px] text-ink-mute">Descartado</span>
          ) : null}

          <span className="ml-auto truncate text-[11px] text-ink-mute">
            {attributionSourceLabel(lead.attribution)}
          </span>
        </div>
      </Link>
    </li>
  );
}
