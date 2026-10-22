"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formataTelefone } from "@/lib/telefone";

type Evidence = {
  id: string;
  source: string;
  type: string;
  actorName: string | null;
  valueCents: number | null;
  currency: string;
  occurredAt: string;
  payload: {
    text?: string;
    reason?: string;
    notes?: string;
    legacy?: boolean;
    coverage?: string;
  } | null;
};
type Sale = {
  id: string;
  status: string;
  amountCents: number | null;
  currency: string;
  confidence: number | null;
  needsReview: boolean;
  confirmationSource: string;
  confirmedAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  occurredAt: string | null;
  lead: { id: string; name: string | null; normalizedPhone: string } | null;
  unit: { name: string } | null;
  source: { name: string; type: string } | null;
  identityCandidates?: {
    id: string;
    name: string | null;
    normalizedPhone: string;
  }[];
  conversionEvents?: {
    type: string;
    status: string;
    valueCents: number | null;
    currency: string | null;
    lastError: string | null;
  }[];
  evidence?: Evidence[];
  attributionSnapshot?: {
    evidence?: unknown;
    trackingClick?: {
      campaignId?: string;
      adId?: string;
      utmSource?: string;
      utmCampaign?: string;
    };
  };
  conflicts?: {
    type: string;
    source: string;
    valueCents: number | null;
    currency: string;
  }[];
};
type Summary = {
  currencies: {
    currency: string;
    confirmedSales: number;
    revenueCents: number;
    averageTicketCents: number | null;
    unknownValues: number;
  }[];
  possibleSales: number;
  requiresReview: number;
  cancelledSales: number;
};
/** "AAAA-MM-DD" no fuso de quem está olhando, para os campos de data. */
function diaLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Os últimos 30 dias, contando hoje: a mesma janela do dashboard e do relatório. */
function ultimos30Dias(): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 29);
  return { de: diaLocal(inicio), ate: diaLocal(hoje) };
}

function formataDiaCurto(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** Diz de qual período é a receita, para ela não parecer um número solto. */
function rotuloDoPeriodo(de: string, ate: string): string {
  if (!de && !ate) return "desde o início";
  const padrao = ultimos30Dias();
  if (de === padrao.de && ate === padrao.ate) return "nos últimos 30 dias";
  if (de && ate) return `de ${formataDiaCurto(de)} a ${formataDiaCurto(ate)}`;
  return de ? `desde ${formataDiaCurto(de)}` : `até ${formataDiaCurto(ate)}`;
}

/** A cor da situação, do jeito que se lê: verde fechou, âmbar falta confirmar, cinza saiu. */
const TOM_DA_SITUACAO: Record<string, string> = {
  CONFIRMED: "bg-success-soft text-success",
  POSSIBLE: "bg-warning-soft text-warning",
  PROBABLE: "bg-warning-soft text-warning",
  REJECTED: "bg-panel-soft text-ink-mute",
  CANCELLED: "bg-panel-soft text-ink-mute",
};

const labels: Record<string, string> = {
  POSSIBLE: "Possível",
  PROBABLE: "Provável",
  CONFIRMED: "Confirmada",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
};
const sources: Record<string, string> = {
  CONVERSATION: "Conversa",
  CRM: "CRM",
  PAYMENT: "Pagamento",
  ERP: "ERP",
  ECOMMERCE: "Loja",
  MANUAL: "Confirmação manual",
  API: "API",
};
export const money = (cents: number | null, currency = "BRL") =>
  cents === null
    ? "Valor não informado"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
        cents / 100,
      );

export async function salesRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/sales/${path}`, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(" · ")
        : (result.message ?? "Não foi possível concluir. Tente novamente."),
    );
  return result as T;
}

function cents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error("Informe o valor com até duas casas decimais.");
  const [whole, decimal = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 2147483647)
    throw new Error("Valor fora do limite permitido.");
  return result;
}

export function SalesWorkspace({
  canManage,
  canAnalyze,
}: {
  canManage: boolean;
  canAnalyze: boolean;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [units, setUnits] = useState<
    { id: string; name: string; code: string }[]
  >([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  // Abre com todas as vendas dos últimos 30 dias. Abrir em "a revisar" fazia a
  // tela parecer vazia justamente para quem tinha vendas, só nenhuma pendente.
  const [filter, setFilter] = useState("");
  const [unit, setUnit] = useState("");
  const [from, setFrom] = useState(() => ultimos30Dias().de);
  const [to, setTo] = useState(() => ultimos30Dias().ate);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const generation = useRef(0);
  const requestId = (key: string) => {
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    return pending.current.id;
  };
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ limit: "20", offset: String(offset) });
    if (filter === "review") query.set("review", "1");
    else if (filter) query.set("status", filter);
    if (unit) query.set("unitId", unit);
    if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) query.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    try {
      const [page, list, metrics] = await Promise.all([
        salesRequest<{ items: Sale[]; total: number }>(`list?${query}`),
        salesRequest<typeof units>("units"),
        canAnalyze
          ? salesRequest<Summary>(`analytics?${query}`)
          : Promise.resolve(null),
      ]);
      if (current !== generation.current) return;
      setSales(page.items);
      setTotal(page.total);
      setUnits(list);
      setSummary(metrics);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [offset, filter, unit, from, to, canAnalyze]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const body = {
        customerName: String(data.get("name") ?? ""),
        phone: String(data.get("phone") ?? "") || undefined,
        valueCents: cents(String(data.get("value") ?? "")),
        currency: String(data.get("currency") ?? ""),
        occurredAt: new Date(String(data.get("date") ?? "")).toISOString(),
        unitCode: String(data.get("unit") ?? "") || undefined,
        product: String(data.get("product") ?? "") || undefined,
        notes: String(data.get("notes") ?? "") || undefined,
      };
      await salesRequest("list", {
        ...body,
        requestId: requestId(JSON.stringify(body)),
      });
      pending.current = null;
      form.reset();
      setShowForm(false);
      setNotice("Venda registrada com confirmação manual.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
      "value",
    );
    setBusy(true);
    setError("");
    try {
      const body = {
        action,
        ...(action === "LINK"
          ? { leadId: String(data.get("leadId") ?? "") }
          : {}),
        ...(data.get("value")
          ? { valueCents: cents(String(data.get("value") ?? "")) }
          : {}),
        currency: selected.currency,
        selectedEvidenceId: String(data.get("evidence") ?? "") || undefined,
        notes: String(data.get("notes") ?? "") || undefined,
      };
      const result = await salesRequest<Sale>(`${selected.id}/review`, {
        ...body,
        requestId: requestId(`${selected.id}:${JSON.stringify(body)}`),
      });
      pending.current = null;
      setSelected(null);
      setNotice(
        result.needsReview
          ? "Evidência registrada. A venda ainda precisa de revisão."
          : "Revisão registrada na auditoria.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Vendas</h1>
          <p className="mt-1 text-corpo text-ink-mute">
            As vendas registradas e as que o sistema percebeu nas conversas.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(!showForm)}>
            Registrar venda
          </Button>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft p-4 text-danger"
        >
          {error}{" "}
          <Button variant="ghost" onClick={() => void refresh()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-success">
          {notice}
        </p>
      )}
      {summary && (
        <section aria-label="Resumo de receita" className="py-4 text-center sm:py-6">
          {summary.currencies.length ? (
            summary.currencies.map((c) => (
              <div key={c.currency}>
                <p className="font-display text-5xl font-semibold tracking-[-0.035em] text-ink sm:text-6xl">
                  {money(c.revenueCents, c.currency)}
                </p>
                <p className="mt-3 text-lg text-ink">
                  em {c.confirmedSales} {c.confirmedSales === 1 ? "venda confirmada" : "vendas confirmadas"}{" "}
                  {rotuloDoPeriodo(from, to)}
                </p>
                <p className="mt-1 text-corpo text-ink-mute">
                  {c.averageTicketCents !== null ? `Ticket médio ${money(c.averageTicketCents, c.currency)}` : null}
                  {c.unknownValues > 0
                    ? ` · ${c.unknownValues} ${c.unknownValues === 1 ? "venda sem valor registrado" : "vendas sem valor registrado"}`
                    : ""}
                </p>
              </div>
            ))
          ) : (
            <>
              <p className="font-display text-xl font-semibold tracking-tight text-ink">
                Nenhuma venda confirmada {rotuloDoPeriodo(from, to)}
              </p>
              <p className="mx-auto mt-1 max-w-md text-corpo text-ink-mute">
                As vendas aparecem aqui quando alguém registra uma, ou quando o sistema percebe uma na conversa.
              </p>
            </>
          )}

          {/* O que pede uma decisão de alguém. Clicar já filtra a lista abaixo. */}
          {summary.possibleSales > 0 || summary.requiresReview > 0 ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {summary.possibleSales > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilter("POSSIBLE");
                    setOffset(0);
                  }}
                  className="focus-ring rounded-full border border-warning-line bg-warning-soft px-4 py-2 text-corpo text-warning"
                >
                  <span className="font-semibold">{summary.possibleSales}</span>{" "}
                  {summary.possibleSales === 1 ? "venda a confirmar" : "vendas a confirmar"} →
                </button>
              ) : null}
              {summary.requiresReview > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilter("review");
                    setOffset(0);
                  }}
                  className="focus-ring rounded-full border border-danger-line bg-danger-soft px-4 py-2 text-corpo text-danger"
                >
                  <span className="font-semibold">{summary.requiresReview}</span>{" "}
                  {summary.requiresReview === 1 ? "com dúvida" : "com dúvida"} →
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-apoio text-ink-mute">Nada esperando confirmação.</p>
          )}
        </section>
      )}
      {showForm && (
        <form
          onSubmit={register}
          className="surface space-y-4 p-5 [&_label]:flex [&_label]:flex-col [&_label]:gap-1.5 [&_label]:text-apoio [&_label]:font-medium [&_label]:text-ink-soft"
        >
          <h2 className="font-semibold">Registrar venda confirmada</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label>
              Cliente
              <Input name="name" required maxLength={200} />
            </label>
            <label>
              Telefone
              <Input name="phone" type="tel" placeholder="(85) 99999-9999" />
            </label>
            <label>
              Valor
              <Input
                name="value"
                inputMode="decimal"
                placeholder="850,00"
                required
              />
            </label>
            <label>
              Moeda
              <Input
                name="currency"
                defaultValue="BRL"
                pattern="[A-Z]{3}"
                required
              />
            </label>
            <label>
              Data e hora
              <Input name="date" type="datetime-local" required />
            </label>
            {units.length > 0 && (
              <label>
                Unidade
                <Select name="unit">
                  <option value="">Organização</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label>
              Produto ou serviço (opcional)
              <Input name="product" maxLength={200} />
            </label>
          </div>
          <label className="block">
            Observações (opcional)
            <Textarea name="notes" rows={2} maxLength={2000} />
          </label>
          <Button disabled={busy}>
            {busy ? "Registrando…" : "Confirmar e registrar"}
          </Button>
          <p className="text-sm text-ink-mute">
            O telefone é usado para procurar o lead e sua campanha de origem.
          </p>
        </form>
      )}
      <div className="flex flex-wrap items-end gap-3 [&_label]:flex [&_label]:flex-col [&_label]:gap-1.5 [&_label]:text-apoio [&_label]:font-medium [&_label]:text-ink-soft">
        <label>
          Estado
          <Select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todas</option>
            <option value="review">Com dúvida</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        {units.length > 0 && (
          <label>
            Unidade
            <Select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label>
          De
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Até
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <Button variant="ghost" onClick={() => void refresh()}>
          Atualizar
        </Button>
      </div>
      <section className="surface overflow-x-auto" aria-busy={loading}>
        {loading ? (
          <p role="status" className="p-8">
            Carregando vendas…
          </p>
        ) : !sales.length ? (
          <p className="p-8 text-center text-corpo text-ink-mute">Nenhuma venda com estes filtros.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {[
                  "Cliente",
                  "Situação",
                  "Valor",
                  "Data",
                  "Como foi confirmada",
                  ...(units.length > 0 ? ["Unidade"] : []),
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-soft/50">
                  <td className="p-4 font-medium text-ink">
                    {s.lead?.name ??
                      s.customerName ??
                      s.lead?.normalizedPhone ??
                      s.customerPhone ??
                      "Cliente não identificado"}
                    {s.lead && (
                      <Link
                        className="block text-apoio font-normal text-ink-mute underline decoration-line underline-offset-2 hover:text-ink"
                        href={`/leads/${s.lead.id}`}
                      >
                        Ver lead
                      </Link>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-apoio font-medium ${TOM_DA_SITUACAO[s.status] ?? "bg-panel-soft text-ink-soft"}`}>
                      {labels[s.status]}
                    </span>
                    {s.needsReview && (
                      <p className="mt-1 text-apoio text-warning">Com dúvida</p>
                    )}
                    {s.confidence !== null && (
                      <p className="text-ink-mute">
                        {Math.round(s.confidence * 100)}% de confiança
                      </p>
                    )}
                  </td>
                  <td className="p-4 tabular-nums">
                    {s.amountCents === null ? <span className="text-ink-mute">Sem valor</span> : money(s.amountCents, s.currency)}
                  </td>
                  <td className="p-4 tabular-nums text-ink-soft">
                    {s.occurredAt ? new Date(s.occurredAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="p-4">
                    {s.source?.type === s.confirmationSource
                      ? s.source.name
                      : sources[s.confirmationSource]}
                  </td>
                  {units.length > 0 ? <td className="p-4">{s.unit?.name ?? "Organização"}</td> : null}
                  <td className="p-4">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          setSelected(await salesRequest<Sale>(s.id));
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Ver detalhes
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-mute">{total} vendas</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(offset - 20)}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            disabled={offset + 20 >= total || loading}
            onClick={() => setOffset(offset + 20)}
          >
            Próxima
          </Button>
        </div>
      </div>
      {selected && (
        <section
          className="surface space-y-4 p-6"
          aria-label="Evidências da venda"
        >
          <div className="flex justify-between gap-4">
            <h2 className="text-xl font-semibold">
              {labels[selected.status]} ·{" "}
              {money(selected.amountCents, selected.currency)}
            </h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Fechar
            </Button>
          </div>
          <p className="text-ink-soft">
            {sources[selected.confirmationSource]}
            {selected.confirmedAt
              ? ` · Confirmada em ${new Date(selected.confirmedAt).toLocaleString("pt-BR")}`
              : " · Sem confirmação"}
          </p>
          {!selected.lead && (
            <p className="text-warning">
              Sem lead associado. A receita está registrada, mas ainda não tem
              campanha atribuída.
            </p>
          )}
          {selected.attributionSnapshot?.trackingClick && (
            <p className="text-sm text-ink-soft">
              Campanha:{" "}
              {selected.attributionSnapshot.trackingClick.utmCampaign ??
                selected.attributionSnapshot.trackingClick.campaignId ??
                "Não identificada"}{" "}
              · Anúncio:{" "}
              {selected.attributionSnapshot.trackingClick.adId ??
                "Não identificado"}
            </p>
          )}
          {!!selected.conflicts?.length && (
            <div className="rounded border border-warning-line bg-warning-soft p-3">
              <p className="font-semibold">Valores ou estados divergentes</p>
              {selected.conflicts.map((c, i) => (
                <p key={i}>
                  {sources[c.source]}: {money(c.valueCents, c.currency)} ·{" "}
                  {c.type}
                </p>
              ))}
            </div>
          )}
          <ol className="space-y-3">
            {selected.evidence?.map((e) => (
              <li key={e.id} className="rounded border border-line p-4">
                <p className="font-medium">
                  {sources[e.source]} · {money(e.valueCents, e.currency)}
                </p>
                <p className="text-sm text-ink-mute">
                  {new Date(e.occurredAt).toLocaleString("pt-BR")} ·{" "}
                  {e.actorName ?? "Evento externo / sistema"}
                </p>
                {e.payload?.text && (
                  <blockquote className="mt-2">“{e.payload.text}”</blockquote>
                )}
                {e.payload?.reason && <p>{e.payload.reason}</p>}
                {e.payload?.notes && <p>{e.payload.notes}</p>}
                {e.payload?.coverage && (
                  <p className="text-sm text-ink-mute">
                    Cobertura da conversa:{" "}
                    {(
                      {
                        COMPLETE: "completa",
                        PARTIAL: "parcial",
                        UNKNOWN: "desconhecida",
                      } as Record<string, string>
                    )[e.payload.coverage] ?? e.payload.coverage}
                  </p>
                )}
                {e.payload?.legacy && (
                  <p className="text-warning">
                    Registro preservado do modelo anterior; sem nova confirmação
                    independente.
                  </p>
                )}
              </li>
            ))}
          </ol>
          {!!selected.conversionEvents?.length && (
            <div className="text-sm text-ink-soft">
              <p className="font-medium">Envio à Meta</p>
              {selected.conversionEvents.map((e, i) => (
                <p key={i}>
                  {e.type} ·{" "}
                  {e.status === "SENT"
                    ? "Enviado"
                    : e.status === "FAILED"
                      ? "Falhou"
                      : "Pendente"}
                  {e.lastError ? ` · ${e.lastError}` : ""}
                </p>
              ))}
            </div>
          )}
          {canManage && (
            <form
              onSubmit={review}
              className="space-y-3 border-t border-line pt-4"
            >
              {!selected.lead && (
                <div className="space-y-2">
                  <label className="block">
                    Associar ao lead
                    {selected.identityCandidates?.length ? (
                      <Select name="leadId">
                        <option value="">Selecione o cliente correto</option>
                        {selected.identityCandidates.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.name ?? formataTelefone(lead.normalizedPhone)} ·{" "}
                            {formataTelefone(lead.normalizedPhone)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input name="leadId" placeholder="ID do lead" />
                    )}
                  </label>
                  <Button
                    name="action"
                    value="LINK"
                    variant="secondary"
                    disabled={busy}
                  >
                    Associar cliente
                  </Button>
                </div>
              )}
              <label className="block">
                Valor confirmado ({selected.currency})
                <Input
                  name="value"
                  inputMode="decimal"
                  defaultValue={
                    selected.amountCents === null
                      ? ""
                      : (selected.amountCents / 100).toFixed(2)
                  }
                />
              </label>
              <label className="block">
                Motivo / observações
                <Textarea name="notes" rows={2} maxLength={2000} />
              </label>
              {!!selected.conflicts?.length && (
                <label className="block">
                  Evidência que deve prevalecer
                  <Select name="evidence">
                    <option value="">Selecione para resolver o conflito</option>
                    {selected.evidence
                      ?.filter((e) => e.source !== "CONVERSATION")
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {sources[e.source]} ·{" "}
                          {money(e.valueCents, e.currency)} · {e.type}
                        </option>
                      ))}
                  </Select>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button name="action" value="CONFIRM" disabled={busy}>
                  Confirmar / corrigir valor
                </Button>
                <Button
                  name="action"
                  value="REJECT"
                  variant="secondary"
                  disabled={busy}
                >
                  Rejeitar
                </Button>
                <Button
                  name="action"
                  value="CANCEL"
                  variant="secondary"
                  disabled={busy}
                >
                  Cancelar venda
                </Button>
                {!!selected.conflicts?.length && (
                  <Button
                    name="action"
                    value="RESOLVE"
                    variant="secondary"
                    disabled={busy}
                  >
                    Resolver conflito
                  </Button>
                )}
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
