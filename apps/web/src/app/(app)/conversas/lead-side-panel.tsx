"use client";

import { ReactNode } from "react";
import { attributionCampaignLabel, attributionMethodLabel, attributionSourceLabel } from "@/lib/attribution";
import { formatCentsAsBRL } from "@/lib/currency";
import { formatDuration, responseSpeedTone, SPEED_TONE_CLASSES } from "@/lib/duration";
import { ESTAGIO_ROTULO, FichaDoLead } from "@/lib/conversas/tipos";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { Badge } from "@/components/ui/badge";
import { LinkParaFicha } from "./inbox-chat";

const ROTULO_DO_EVENTO: Record<string, string> = {
  LEAD_CREATED: "Lead criado",
  CONVERSATION_STARTED: "Conversa iniciada",
  MESSAGE_RECEIVED: "Mensagem recebida",
  QUALIFIED: "Lead qualificado",
  MEETING_SCHEDULED: "Reunião marcada",
  DISQUALIFIED: "Lead desqualificado",
  REACTIVATED: "Lead reativado",
  SALE_DETECTED: "Venda detectada",
  REVENUE_DETECTED: "Receita registrada",
};

/** Quantos passos do histórico cabem sem a coluna virar uma segunda tela. */
const EVENTOS_VISIVEIS = 6;

/**
 * A coluna da direita.
 *
 * Os mesmos painéis da ficha do lead, compactados. O ponto da caixa de entrada
 * é responder sabendo de onde a pessoa veio, em que pé está e quanto vale:
 * respondendo pelo WhatsApp comum nada disso está à vista.
 */
export function LeadSidePanel({ ficha }: { ficha: FichaDoLead }) {
  const { metrics } = ficha;
  const tomDaResposta = SPEED_TONE_CLASSES[responseSpeedTone(metrics.firstResponseSeconds)];
  const eventos = ficha.events.slice(0, EVENTOS_VISIVEIS);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-line/70 bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5">
        <h2 className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Contexto</h2>
        <LinkParaFicha leadId={ficha.id} />
      </div>

      <div className="space-y-3 p-3">
        <Painel titulo="Atendimento">
          <div className="grid grid-cols-2 gap-3">
            <Numero
              rotulo="Primeira resposta"
              valor={formatDuration(metrics.firstResponseSeconds)}
              classe={tomDaResposta}
            />
            <Numero rotulo="Do clique ao contato" valor={formatDuration(metrics.clickToContactSeconds)} />
          </div>
          <p className="mt-2 text-rotulo text-ink-mute">
            {metrics.inboundCount} recebidas · {metrics.outboundCount} enviadas
          </p>
          {metrics.awaitingReply ? (
            <p className="mt-2 text-apoio font-medium text-amber-700 dark:text-amber-400">
              Aguardando resposta {metrics.lastMessageAt ? tempoRelativo(metrics.lastMessageAt) : ""}
            </p>
          ) : null}
        </Painel>

        <Painel titulo="Origem">
          <Linha rotulo="Origem" valor={attributionSourceLabel(ficha.attribution)} />
          <Linha rotulo="Campanha" valor={attributionCampaignLabel(ficha.attribution)} />
          {ficha.adReferences.campaign ? (
            <Linha
              rotulo="Campanha do anúncio"
              valor={ficha.adReferences.campaign.name ?? ficha.adReferences.campaign.externalId}
            />
          ) : null}
          {/*
            Como sabemos, e não só o que sabemos: "clique rastreado" e
            "chute" levariam a decisões diferentes sobre a mesma campanha.
          */}
          <Linha rotulo="Como foi atribuído" valor={attributionMethodLabel(ficha.attribution?.method)} />
        </Painel>

        <Painel titulo="Estágio e venda">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={ficha.status === "WON" ? "success" : "info"}>{ESTAGIO_ROTULO[ficha.status]}</Badge>
            {ficha.disqualifiedAt ? <Badge tone="neutral">Descartado</Badge> : null}
          </div>
          {ficha.disqualifiedReason ? (
            <p className="mt-2 text-apoio leading-relaxed text-ink-mute">{ficha.disqualifiedReason}</p>
          ) : null}
          <div className="mt-2">
            <Linha
              rotulo="Receita"
              valor={
                ficha.sale
                  ? formatCentsAsBRL(ficha.sale.amountCents)
                  : "Sem venda registrada"
              }
            />
          </div>
        </Painel>

        <Painel titulo="Histórico">
          {eventos.length === 0 ? (
            <p className="text-apoio text-ink-mute">Sem eventos ainda.</p>
          ) : (
            <ol className="space-y-2">
              {eventos.map((evento) => (
                <li key={evento.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-apoio text-ink-soft">
                    {ROTULO_DO_EVENTO[evento.type] ?? evento.type}
                  </span>
                  <span className="shrink-0 text-rotulo text-ink-mute" title={dataCompleta(evento.occurredAt)}>
                    {tempoRelativo(evento.occurredAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {ficha.events.length > EVENTOS_VISIVEIS ? (
            <p className="mt-2 text-rotulo text-ink-mute">
              Mais {ficha.events.length - EVENTOS_VISIVEIS} na ficha completa.
            </p>
          ) : null}
        </Painel>
      </div>
    </div>
  );
}

function Painel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/70 bg-panel-soft/40 p-3.5">
      <h3 className="mb-2.5 text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</h3>
      {children}
    </section>
  );
}

function Numero({ rotulo, valor, classe }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div>
      <p className="text-rotulo text-ink-mute">{rotulo}</p>
      <p className={`mt-0.5 text-destaque font-semibold tabular-nums ${classe ?? "text-ink"}`}>{valor}</p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-apoio text-ink-mute">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right text-apoio text-ink-soft">{valor}</dd>
    </div>
  );
}
