import { ReactNode } from "react";
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

const STATUS_LABELS: Record<LeadDetail["status"], string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  MEETING_SCHEDULED: "Reunião marcada",
  WON: "Venda",
};

const STATUS_CLASSES: Record<LeadDetail["status"], string> = {
  NEW: "bg-slate-100 text-slate-700",
  QUALIFIED: "bg-blue-50 text-blue-700",
  MEETING_SCHEDULED: "bg-violet-50 text-violet-700",
  WON: "bg-emerald-50 text-emerald-700",
};

const CONVERSION_TYPE_LABELS: Record<ConversionEvent["type"], string> = {
  LEAD: "Lead",
  QUALIFIED_LEAD: "Lead qualificado",
  PURCHASE: "Compra",
};

const CONVERSION_STATUS_LABELS: Record<ConversionEvent["status"], string> = {
  PENDING: "Na fila",
  SENT: "Enviado",
  RETRYING: "Tentando novamente",
  FAILED: "Falhou",
};

const CONVERSION_STATUS_CLASSES: Record<ConversionEvent["status"], string> = {
  PENDING: "text-slate-500",
  SENT: "text-emerald-700",
  RETRYING: "text-amber-700",
  FAILED: "text-red-700",
};

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "Sem data";
}

/** Sem nome sincronizado, o id cru ainda diz mais do que um campo vazio. */
function adReferenceLabel(reference: AdReference | null): string {
  if (!reference) return "Sem anúncio";
  return reference.name ?? reference.externalId;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`text-lg font-semibold ${tone ?? "text-slate-800"}`}>{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="break-words text-slate-700">{value || "Sem dado"}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{lead.name ?? "Sem nome"}</h1>
          <p className="text-sm text-slate-500">{lead.normalizedPhone}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[lead.status]}`}>
          {STATUS_LABELS[lead.status]}
        </span>
        {/*
          O dado mais acionável da tela: se a última mensagem é do lead, alguém
          precisa responder agora. Fica ao lado do nome, não escondido num card.
        */}
        {lead.disqualifiedAt ? (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
            Desqualificado
          </span>
        ) : null}
        {metrics.awaitingReply ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            Aguardando resposta desde {formatDateTime(metrics.lastMessageAt)}
          </span>
        ) : null}
      </div>

      <Card title="Atendimento">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Stat
            label="Primeira resposta"
            value={formatDuration(metrics.firstResponseSeconds)}
            tone={SPEED_TONE_CLASSES[responseSpeedTone(metrics.firstResponseSeconds)]}
          />
          <Stat label="Do clique ao contato" value={formatDuration(metrics.clickToContactSeconds)} />
          <Stat label="Até qualificar" value={formatDuration(metrics.timeToQualifiedSeconds)} />
          <Stat label="Até a venda" value={formatDuration(metrics.timeToWonSeconds)} />
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          {metrics.inboundCount} recebida(s) · {metrics.outboundCount} enviada(s) · primeiro contato em{" "}
          {formatDateTime(lead.firstContactAt)}
        </p>
      </Card>

      <Card title="Origem">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Origem" value={attributionSourceLabel(attribution)} />
          <Field label="Como foi identificada" value={attributionMethodLabel(attribution?.method)} />
          <Field label="Confiança" value={attribution?.confidence === "HIGH" ? "Alta" : "Sem evidência"} />
          <Field label="Campanha" value={adReferenceLabel(adReferences.campaign) || attributionCampaignLabel(attribution)} />
          <Field label="Conjunto de anúncios" value={adReferenceLabel(adReferences.adSet)} />
          <Field label="Anúncio" value={adReferenceLabel(adReferences.ad)} />
        </dl>

        {click ? (
          <>
            <div className="my-4 border-t border-slate-100" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Clicou em" value={formatDateTime(click.clickedAt)} />
              <Field label="Dispositivo" value={deviceLabel(click.userAgent)} />
              <Field label="Link rastreável" value={click.trackingLink?.name} />
              <Field label="Página de destino" value={click.landingUrl} />
              <Field label="Veio de" value={click.referrer} />
            </dl>
            {utms.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs text-slate-400">Parâmetros UTM</p>
                <div className="flex flex-wrap gap-2">
                  {utms.map(([key, value]) => (
                    <span key={key} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                      {key}={value}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-xs text-slate-400">
            {attribution?.method === "CTWA_REFERRAL"
              ? "A Meta identificou o anúncio diretamente no referral da mensagem, sem clique rastreado por nós."
              : "Sem clique rastreado para este lead."}
          </p>
        )}
      </Card>

      <Card title="Status e venda">
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Field label="Qualificado em" value={formatDateTime(lead.qualifiedAt)} />
          <Field label="Reunião marcada em" value={formatDateTime(lead.meetingScheduledAt)} />
          <Field label="Venda em" value={formatDateTime(lead.wonAt)} />
          <Field label="Receita" value={formatCentsAsBRL(lead.sale?.amountCents)} />
          <Field
            label="Registro da venda"
            value={lead.sale ? (lead.sale.classifierType === "MANUAL" ? "Manual" : "Automático") : "Sem venda"}
          />
        </dl>

        <p className="mb-3 text-xs text-slate-400">
          Correção manual. Use apenas quando o tracking automático não capturou o estágio/valor corretamente.
        </p>
        <ManualEditForm leadId={lead.id} status={lead.status} />

        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="mb-3 text-xs text-slate-400">
            Desqualificar retira o lead das taxas de conversão sem apagar o histórico, para quem
            nunca foi oportunidade. O estágio a que ele chegou é preservado.
          </p>
          <DisqualifyForm
            leadId={lead.id}
            disqualifiedAt={lead.disqualifiedAt}
            disqualifiedReason={lead.disqualifiedReason}
            isWon={lead.status === "WON"}
          />
        </div>
      </Card>

      {/*
        Sem isto o cliente não tem como saber se a conversão voltou para a
        Meta, ou seja, se o algoritmo que ele paga para otimizar chegou a
        receber o resultado que ele está vendo nesta tela.
      */}
      <Card title="Conversões enviadas à Meta">
        {lead.conversionEvents.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {lead.conversionEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-slate-700">{CONVERSION_TYPE_LABELS[event.type]}</span>
                <span className={CONVERSION_STATUS_CLASSES[event.status]}>
                  {CONVERSION_STATUS_LABELS[event.status]}
                </span>
                <span className="text-xs text-slate-400">
                  {event.sentAt ? `em ${formatDateTime(event.sentAt)}` : `ocorreu em ${formatDateTime(event.occurredAt)}`}
                  {event.attempts > 1 ? ` · ${event.attempts} tentativas` : ""}
                </span>
                {event.lastError ? <span className="w-full text-xs text-red-600">{event.lastError}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            Nenhuma conversão enviada. Conecte a API de Conversões nas integrações para devolver esses eventos à Meta.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Timeline</h2>
          <ol className="space-y-3">
            {lead.events.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="text-slate-400">{formatDateTime(event.occurredAt)}</span>{" "}
                <span className="text-slate-700">{EVENT_LABELS[event.type] ?? event.type}</span>
              </li>
            ))}
            {lead.events.length === 0 ? <li className="text-sm text-slate-400">Sem eventos ainda.</li> : null}
          </ol>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Conversa</h2>
          <ol className="space-y-3">
            {lead.messages.map((message) => {
              const isOutbound = message.direction === "OUTBOUND";
              return (
                <li key={message.id} className={isOutbound ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isOutbound ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.type === "TEXT" ? message.text : "[mensagem não textual]"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(message.timestamp)}
                      {isOutbound && message.outboundStatus === "PENDING" ? " · enviando..." : null}
                      {isOutbound && message.outboundStatus === "SENT" ? " · enviada" : null}
                    </p>
                    {isOutbound && message.outboundStatus === "FAILED" ? (
                      <p className="mt-1 text-xs text-red-600">Falha no envio: {message.sendError}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {lead.messages.length === 0 ? <li className="text-sm text-slate-400">Sem mensagens ainda.</li> : null}
          </ol>

          <ReplyBox leadId={lead.id} disabledReason={replyDisabledReason} />
        </div>
      </div>
    </div>
  );
}
