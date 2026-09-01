import { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import {
  attributionCampaignLabel,
  attributionMethodLabel,
  attributionSourceLabel,
  AttributionSummary,
  deviceLabel,
} from "@/lib/attribution";
import { formatCentsAsBRL } from "@/lib/currency";
import { formatDuration, responseSpeedTone, SPEED_TONE_CLASSES } from "@/lib/duration";
import { Badge } from "@/components/ui/badge";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { DisqualifyForm, ManualEditForm } from "./manual-edit-form";
import { ReplyBox } from "./reply-box";

interface WhatsAppConnectionSummary {
  provider: "CLOUD_API" | "EVOLUTION";
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
}

/**
 * Responder exige uma conexão por QR Code ativa. Explicar o porquê na própria
 * caixa evita o usuário digitar uma resposta e só então descobrir que ela não
 * pode sair.
 */
function replyDisabledReasonFor(connection: WhatsAppConnectionSummary | null): string | null {
  if (!connection || connection.status === "DISCONNECTED") {
    return "Conecte um número de WhatsApp para responder por aqui.";
  }
  if (connection.status === "PENDING_QR") {
    return "Leia o QR Code na tela de integrações para ativar a conexão.";
  }
  if (connection.provider !== "EVOLUTION") {
    return "Responder pela plataforma está disponível apenas na conexão por QR Code.";
  }
  return null;
}

interface LeadEvent {
  id: string;
  type: string;
  occurredAt: string;
  metadata: unknown;
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "OTHER";
  text: string | null;
  timestamp: string;
  outboundStatus: "PENDING" | "SENT" | "FAILED" | null;
  sendError: string | null;
}

interface TrackingClick {
  clickedAt: string;
  landingUrl: string;
  referrer: string | null;
  userAgent: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  trackingLink: { name: string; code: string } | null;
}

interface AdReference {
  externalId: string;
  name: string | null;
}

interface ConversionEvent {
  id: string;
  type: "LEAD" | "QUALIFIED_LEAD" | "PURCHASE";
  status: "PENDING" | "SENT" | "RETRYING" | "FAILED";
  occurredAt: string;
  sentAt: string | null;
  lastError: string | null;
  attempts: number;
}

interface LeadMetrics {
  firstResponseSeconds: number | null;
  clickToContactSeconds: number | null;
  timeToQualifiedSeconds: number | null;
  timeToWonSeconds: number | null;
  inboundCount: number;
  outboundCount: number;
  awaitingReply: boolean;
  lastMessageAt: string | null;
}

interface LeadDetail {
  id: string;
  name: string | null;
  normalizedPhone: string;
  status: "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";
  qualifiedAt: string | null;
  meetingScheduledAt: string | null;
  wonAt: string | null;
  disqualifiedAt: string | null;
  disqualifiedReason: string | null;
  firstContactAt: string;
  lastContactAt: string;
  events: LeadEvent[];
  messages: Message[];
  attribution: (AttributionSummary & { attributedAt: string; trackingClick: TrackingClick | null }) | null;
  adReferences: { campaign: AdReference | null; adSet: AdReference | null; ad: AdReference | null };
  conversionEvents: ConversionEvent[];
  metrics: LeadMetrics;
  sale: { amountCents: number | null; classifierType: "AUTOMATIC" | "MANUAL" } | null;
}

const EVENT_LABELS: Record<string, string> = {
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

const STATUS: Record<LeadDetail["status"], { rotulo: string; tom: "neutral" | "info" | "brand" | "success" }> = {
  NEW: { rotulo: "Novo", tom: "neutral" },
  QUALIFIED: { rotulo: "Qualificado", tom: "info" },
  MEETING_SCHEDULED: { rotulo: "Reunião marcada", tom: "brand" },
  WON: { rotulo: "Venda", tom: "success" },
};

const CONVERSAO_ROTULO: Record<ConversionEvent["type"], string> = {
  LEAD: "Lead",
  QUALIFIED_LEAD: "Lead qualificado",
  PURCHASE: "Compra",
};

const CONVERSAO_ESTADO: Record<ConversionEvent["status"], { rotulo: string; tom: "neutral" | "success" | "warning" | "danger" }> = {
  PENDING: { rotulo: "Na fila", tom: "neutral" },
  SENT: { rotulo: "Enviado", tom: "success" },
  RETRYING: { rotulo: "Tentando", tom: "warning" },
  FAILED: { rotulo: "Falhou", tom: "danger" },
};

function formatDateTime(value: string | null | undefined): string {
  return value ? dataCompleta(value) : "Sem data";
}

/** Sem nome sincronizado, o id cru ainda diz mais que um campo vazio. */
function adReferenceLabel(reference: AdReference | null): string {
  if (!reference) return "Sem anúncio";
  return reference.name ?? reference.externalId;
}

/** Painel da coluna lateral: título discreto, conteúdo em primeiro plano. */
function Painel({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[12.5px] text-ink-mute">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] text-ink-soft">{valor}</dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let lead: LeadDetail;
  try {
    lead = await apiFetch<LeadDetail>(`/leads/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const connection = await apiFetch<WhatsAppConnectionSummary | null>("/integrations/whatsapp");
  const replyDisabledReason = replyDisabledReasonFor(connection);

  const { metrics, attribution, adReferences } = lead;
  const click = attribution?.trackingClick ?? null;

  const utms = [
    ["utm_source", click?.utmSource],
    ["utm_medium", click?.utmMedium],
    ["utm_campaign", click?.utmCampaign],
    ["utm_content", click?.utmContent],
    ["utm_term", click?.utmTerm],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  const tomResposta = SPEED_TONE_CLASSES[responseSpeedTone(metrics.firstResponseSeconds)];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/leads"
        className="focus-ring group mb-5 inline-flex items-center gap-1.5 rounded text-[13px] text-ink-mute transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform duration-200 ease-soft group-hover:-translate-x-0.5" aria-hidden>
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Todos os leads
      </Link>

      {/*
        Cabeçalho como identidade, não como mais um card. O nome grande, o
        telefone abaixo, e os selos de estado na mesma linha: quem abre a ficha
        quer saber quem é e em que pé está antes de qualquer número.
      */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
            {lead.name ?? "Sem nome"}
          </h1>
          <p className="mt-0.5 text-sm tabular-nums text-ink-mute">{lead.normalizedPhone}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS[lead.status].tom}>{STATUS[lead.status].rotulo}</Badge>
          {lead.disqualifiedAt ? <Badge tone="neutral">Descartado</Badge> : null}
          {/*
            O dado mais acionável da tela inteira: se a última mensagem é do
            lead, alguém precisa responder agora. Fica junto do nome, com ponto
            pulsante, porque é uma condição contínua e não um rótulo estático.
          */}
          {metrics.awaitingReply ? (
            <Badge tone="warning">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              Aguardando resposta {metrics.lastMessageAt ? tempoRelativo(metrics.lastMessageAt) : ""}
            </Badge>
          ) : null}
        </div>
      </header>

      {/*
        A conversa ocupa dois terços e os fatos ficam à direita. É a inversão
        do layout antigo, onde tudo empilhava com o mesmo peso: quem abre um
        lead vem ler o que foi dito, e os números existem para contextualizar
        essa leitura, não para competir com ela.
      */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="surface flex max-h-[42rem] flex-col p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-mute">Conversa</h2>
            <span className="text-[12px] text-ink-mute">
              {metrics.inboundCount} recebidas · {metrics.outboundCount} enviadas
            </span>
          </div>

          <ol className="-mx-1 flex-1 space-y-2.5 overflow-y-auto px-1">
            {lead.messages.map((message) => {
              const nossa = message.direction === "OUTBOUND";
              return (
                <li key={message.id} className={nossa ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-subtle ${
                      nossa
                        ? "rounded-br-md bg-accent/10 text-ink ring-1 ring-inset ring-accent/20"
                        : "rounded-bl-md bg-panel-soft text-ink ring-1 ring-inset ring-line/60"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.type === "TEXT" ? message.text : "Mensagem não textual"}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-mute" title={dataCompleta(message.timestamp)}>
                      {tempoRelativo(message.timestamp)}
                      {nossa && message.outboundStatus === "PENDING" ? " · enviando" : null}
                      {nossa && message.outboundStatus === "SENT" ? " · enviada" : null}
                    </p>
                    {nossa && message.outboundStatus === "FAILED" ? (
                      <p className="mt-1 text-[11.5px] text-red-600 dark:text-red-400">
                        Falha no envio: {message.sendError}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {lead.messages.length === 0 ? (
              <li className="py-10 text-center text-sm text-ink-mute">Nenhuma mensagem ainda.</li>
            ) : null}
          </ol>

          <div className="mt-4 border-t border-line/60 pt-4">
            <ReplyBox leadId={lead.id} disabledReason={replyDisabledReason} />
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <Painel titulo="Atendimento">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11.5px] text-ink-mute">Primeira resposta</p>
                <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tomResposta}`}>
                  {formatDuration(metrics.firstResponseSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] text-ink-mute">Do clique ao contato</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                  {formatDuration(metrics.clickToContactSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] text-ink-mute">Até qualificar</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                  {formatDuration(metrics.timeToQualifiedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] text-ink-mute">Até a venda</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                  {formatDuration(metrics.timeToWonSeconds)}
                </p>
              </div>
            </div>
          </Painel>

          <Painel titulo="Origem">
            <dl className="divide-y divide-line/50">
              <Linha rotulo="Origem" valor={attributionSourceLabel(attribution)} />
              <Linha rotulo="Evidência" valor={attributionMethodLabel(attribution?.method)} />
              <Linha
                rotulo="Campanha"
                valor={adReferences.campaign ? adReferenceLabel(adReferences.campaign) : attributionCampaignLabel(attribution)}
              />
              {adReferences.adSet ? <Linha rotulo="Conjunto" valor={adReferenceLabel(adReferences.adSet)} /> : null}
              {adReferences.ad ? <Linha rotulo="Anúncio" valor={adReferenceLabel(adReferences.ad)} /> : null}
              {click ? (
                <>
                  <Linha rotulo="Clicou" valor={tempoRelativo(click.clickedAt)} />
                  <Linha rotulo="Dispositivo" valor={deviceLabel(click.userAgent)} />
                  {click.trackingLink ? <Linha rotulo="Link" valor={click.trackingLink.name} /> : null}
                </>
              ) : null}
            </dl>

            {utms.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/50 pt-3">
                {utms.map(([chave, valor]) => (
                  <span key={chave} className="rounded-md bg-panel-soft px-2 py-1 text-[11px] text-ink-soft">
                    {chave}={valor}
                  </span>
                ))}
              </div>
            ) : null}

            {!click ? (
              <p className="mt-3 border-t border-line/50 pt-3 text-[12px] leading-relaxed text-ink-mute">
                {attribution?.method === "CTWA_REFERRAL"
                  ? "A Meta identificou o anúncio no referral da mensagem, sem clique rastreado por nós."
                  : "Sem clique rastreado para este lead."}
              </p>
            ) : null}
          </Painel>

          <Painel titulo="Estágio e venda">
            <dl className="mb-4 divide-y divide-line/50">
              <Linha rotulo="Primeiro contato" valor={tempoRelativo(lead.firstContactAt)} />
              <Linha rotulo="Qualificado" valor={lead.qualifiedAt ? tempoRelativo(lead.qualifiedAt) : "Sem data"} />
              <Linha rotulo="Reunião" valor={lead.meetingScheduledAt ? tempoRelativo(lead.meetingScheduledAt) : "Sem data"} />
              <Linha rotulo="Venda" valor={lead.wonAt ? tempoRelativo(lead.wonAt) : "Sem data"} />
              <Linha rotulo="Receita" valor={formatCentsAsBRL(lead.sale?.amountCents)} />
              {lead.sale ? (
                <Linha rotulo="Registro" valor={lead.sale.classifierType === "MANUAL" ? "Manual" : "Automático"} />
              ) : null}
            </dl>

            <div className="border-t border-line/50 pt-4">
              <p className="mb-3 text-[11.5px] leading-relaxed text-ink-mute">
                Correção manual. Use quando o tracking automático não capturou o estágio ou o valor.
              </p>
              <ManualEditForm leadId={lead.id} status={lead.status} />

              <div className="mt-4 border-t border-line/50 pt-4">
                <DisqualifyForm
                  leadId={lead.id}
                  disqualifiedAt={lead.disqualifiedAt}
                  disqualifiedReason={lead.disqualifiedReason}
                  isWon={lead.status === "WON"}
                />
              </div>
            </div>
          </Painel>

          <Painel titulo="Enviado à Meta">
            {lead.conversionEvents.length > 0 ? (
              <ul className="space-y-2.5">
                {lead.conversionEvents.map((evento) => (
                  <li key={evento.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="text-ink-soft">{CONVERSAO_ROTULO[evento.type]}</span>
                    <Badge tone={CONVERSAO_ESTADO[evento.status].tom}>{CONVERSAO_ESTADO[evento.status].rotulo}</Badge>
                    <span className="text-[11.5px] text-ink-mute">
                      {evento.sentAt ? tempoRelativo(evento.sentAt) : tempoRelativo(evento.occurredAt)}
                    </span>
                    {evento.lastError ? (
                      <span className="w-full text-[11.5px] text-red-600 dark:text-red-400">{evento.lastError}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ink-mute">
                Nenhuma conversão enviada. Conecte a API de Conversões para devolver esses eventos à Meta.
              </p>
            )}
          </Painel>

          <Painel titulo="Histórico">
            {/*
              Linha vertical ligando os pontos: a sucessão fica explícita, em
              vez de o leitor ter que inferir ordem de uma pilha de linhas.
            */}
            <ol className="relative space-y-3 pl-4">
              <span className="absolute bottom-2 left-[3px] top-2 w-px bg-line" aria-hidden />
              {lead.events.map((evento) => (
                <li key={evento.id} className="relative">
                  <span className="absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full bg-ink-mute ring-2 ring-panel" aria-hidden />
                  <p className="text-[13px] text-ink-soft">{EVENT_LABELS[evento.type] ?? evento.type}</p>
                  <p className="text-[11.5px] text-ink-mute" title={formatDateTime(evento.occurredAt)}>
                    {tempoRelativo(evento.occurredAt)}
                  </p>
                </li>
              ))}
              {lead.events.length === 0 ? <li className="text-[13px] text-ink-mute">Sem eventos.</li> : null}
            </ol>
          </Painel>
        </div>
      </div>
    </div>
  );
}
