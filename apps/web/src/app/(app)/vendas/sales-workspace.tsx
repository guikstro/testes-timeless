"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, Drawer } from "@/components/ui/dialog";
import { GrupoDePilulas } from "@/components/ui/pill-group";
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
        ? result.message.join(". ")
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

  const nomeDaVenda = (s: Sale) =>
    s.lead?.name ??
    s.customerName ??
    (s.lead?.normalizedPhone ? formataTelefone(s.lead.normalizedPhone) : null) ??
    (s.customerPhone ? formataTelefone(s.customerPhone) : null) ??
    "Cliente não identificado";
  const filtra = (valor: string) => {
    setFilter(valor);
    setOffset(0);
  };
  const ROTULO = "flex flex-col gap-1.5 text-apoio font-medium text-ink-soft";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Vendas</h1>
          <p className="mt-1 text-corpo text-ink-mute">
            As vendas registradas e as que o sistema percebeu nas conversas.
          </p>
        </div>
        {canManage && <Button onClick={() => setShowForm(true)}>Registrar venda</Button>}
      </header>

      {error && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-corpo text-danger">
          {error}
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-6 border-l-2 border-accent pl-3 text-corpo text-ink-soft">
          {notice}
        </p>
      )}

      {/*
        A receita do período em uma linha, alinhada como o resto da tela. O
        número gigante centralizado parecia capa de apresentação, não uma
        tela de trabalho; o que pede decisão fica ao lado dele.
      */}
      {summary && (
        <section aria-label="Resumo de receita" className="mt-8 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-7">
          {summary.currencies.length ? (
            <div className="space-y-4">
              {summary.currencies.map((c) => (
                <div key={c.currency}>
                  <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
                    {money(c.revenueCents, c.currency)}
                  </p>
                  <p className="mt-1.5 text-corpo text-ink-soft">
                    {c.confirmedSales} {c.confirmedSales === 1 ? "venda confirmada" : "vendas confirmadas"}{" "}
                    {rotuloDoPeriodo(from, to)}
                    {c.averageTicketCents !== null ? `, ticket médio de ${money(c.averageTicketCents, c.currency)}` : ""}.
                    {c.unknownValues > 0
                      ? ` ${c.unknownValues} ${c.unknownValues === 1 ? "venda está sem valor" : "vendas estão sem valor"}.`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <p className="font-display text-xl font-semibold tracking-tight text-ink">
                Nenhuma venda confirmada {rotuloDoPeriodo(from, to)}
              </p>
              <p className="mt-1 max-w-md text-corpo text-ink-mute">
                Aparecem aqui quando alguém registra uma venda ou quando o sistema percebe uma na conversa.
              </p>
            </div>
          )}

          {/* O que pede uma decisão de alguém. Clicar já filtra a lista. */}
          {summary.possibleSales > 0 || summary.requiresReview > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summary.possibleSales > 0 ? (
                <button
                  type="button"
                  onClick={() => filtra("POSSIBLE")}
                  className="focus-ring rounded-full border border-warning-line bg-warning-soft px-4 py-2 text-corpo text-warning"
                >
                  <span className="font-semibold">{summary.possibleSales}</span>{" "}
                  {summary.possibleSales === 1 ? "venda a confirmar" : "vendas a confirmar"}
                </button>
              ) : null}
              {summary.requiresReview > 0 ? (
                <button
                  type="button"
                  onClick={() => filtra("review")}
                  className="focus-ring rounded-full border border-danger-line bg-danger-soft px-4 py-2 text-corpo text-danger"
                >
                  <span className="font-semibold">{summary.requiresReview}</span> com dúvida
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-apoio text-ink-mute">Nada esperando confirmação.</p>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <GrupoDePilulas
          ativo={filter}
          opcoes={[
            { chave: "", rotulo: "Todas", aoClicar: () => filtra("") },
            { chave: "CONFIRMED", rotulo: "Confirmadas", aoClicar: () => filtra("CONFIRMED") },
            { chave: "POSSIBLE", rotulo: "A confirmar", aoClicar: () => filtra("POSSIBLE") },
            { chave: "review", rotulo: "Com dúvida", aoClicar: () => filtra("review") },
            { chave: "CANCELLED", rotulo: "Canceladas", aoClicar: () => filtra("CANCELLED") },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          {units.length > 0 && (
            <label className={ROTULO}>
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
          <label className={ROTULO}>
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
          <label className={ROTULO}>
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
        </div>
      </div>

      <section className="surface mt-4 overflow-x-auto" aria-busy={loading}>
        {loading ? (
          <p role="status" className="p-8 text-corpo text-ink-mute">
            Carregando vendas…
          </p>
        ) : !sales.length ? (
          <p className="p-10 text-center text-corpo text-ink-mute">Nenhuma venda com estes filtros.</p>
        ) : (
          <table className="w-full text-left text-corpo">
            <thead>
              <tr className="border-b border-line">
                {["Cliente", "Situação", "Valor", "Data", "Como foi confirmada", ...(units.length > 0 ? ["Unidade"] : []), ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-apoio font-medium text-ink-mute">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-soft/50">
                  <td className="px-4 py-3.5 font-medium text-ink">
                    {nomeDaVenda(s)}
                    {s.lead && (
                      <Link
                        className="block text-apoio font-normal text-ink-mute underline decoration-line underline-offset-2 hover:text-ink"
                        href={`/leads/${s.lead.id}`}
                      >
                        Ver lead
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-apoio font-medium ${TOM_DA_SITUACAO[s.status] ?? "bg-panel-soft text-ink-soft"}`}>
                      {labels[s.status]}
                    </span>
                    {s.needsReview && <p className="mt-1 text-apoio text-warning">Com dúvida</p>}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">
                    {s.amountCents === null ? <span className="text-ink-mute">Sem valor</span> : money(s.amountCents, s.currency)}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                    {s.occurredAt ? new Date(s.occurredAt).toLocaleDateString("pt-BR") : <span className="text-ink-mute">Sem data</span>}
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft">
                    {s.source?.type === s.confirmationSource ? s.source.name : sources[s.confirmationSource]}
                  </td>
                  {units.length > 0 ? <td className="px-4 py-3.5 text-ink-soft">{s.unit?.name ?? "Organização"}</td> : null}
                  <td className="px-4 py-3.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
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

      {total > 20 ? (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-apoio text-ink-mute">{total} vendas</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset(offset - 20)}>
              Anterior
            </Button>
            <Button variant="secondary" size="sm" disabled={offset + 20 >= total || loading} onClick={() => setOffset(offset + 20)}>
              Próxima
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        aberto={showForm}
        aoFechar={() => setShowForm(false)}
        titulo="Registrar venda"
        descricao="Pelo telefone o sistema encontra a conversa e a campanha de onde o cliente veio."
      >
        <form onSubmit={register} className="space-y-4 pb-3">
          <label className={ROTULO}>
            Cliente
            <Input name="name" required maxLength={200} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={ROTULO}>
              Telefone
              <Input name="phone" type="tel" placeholder="(85) 99999-9999" />
            </label>
            <label className={ROTULO}>
              Valor
              <Input name="value" inputMode="decimal" placeholder="850,00" required />
            </label>
          </div>
          {/* Real sempre: quem vende em outra moeda registra pela integração. */}
          <input type="hidden" name="currency" value="BRL" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={ROTULO}>
              Data e hora
              <Input name="date" type="datetime-local" required />
            </label>
            {units.length > 0 && (
              <label className={ROTULO}>
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
          </div>
          <label className={ROTULO}>
            Produto ou serviço (opcional)
            <Input name="product" maxLength={200} />
          </label>
          <label className={ROTULO}>
            Observação (opcional)
            <Textarea name="notes" rows={2} maxLength={2000} />
          </label>
          <Button disabled={busy}>{busy ? "Registrando…" : "Confirmar e registrar"}</Button>
        </form>
      </Dialog>

      <Drawer
        aberto={selected !== null}
        aoFechar={() => setSelected(null)}
        titulo={selected ? nomeDaVenda(selected) : ""}
        descricao={
          selected
            ? `${labels[selected.status]}, ${money(selected.amountCents, selected.currency)}. ${
                selected.confirmedAt
                  ? `${sources[selected.confirmationSource]}, confirmada em ${new Date(selected.confirmedAt).toLocaleString("pt-BR")}.`
                  : "Ainda sem confirmação."
              }`
            : undefined
        }
      >
        {selected ? (
          <div className="space-y-5 pb-4 text-corpo">
            {!selected.lead && (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">
                Sem lead associado: a receita está registrada, mas ainda não tem campanha de origem.
              </p>
            )}
            {selected.attributionSnapshot?.trackingClick && (
              <p className="text-ink-soft">
                Veio da campanha{" "}
                <span className="font-medium text-ink">
                  {selected.attributionSnapshot.trackingClick.utmCampaign ??
                    selected.attributionSnapshot.trackingClick.campaignId ??
                    "não identificada"}
                </span>
                {selected.attributionSnapshot.trackingClick.adId
                  ? `, anúncio ${selected.attributionSnapshot.trackingClick.adId}`
                  : ""}
                .
              </p>
            )}
            {!!selected.conflicts?.length && (
              <div className="rounded-xl border border-warning-line bg-warning-soft p-3 text-warning">
                <p className="font-semibold">Os sistemas discordam sobre esta venda</p>
                {selected.conflicts.map((c, i) => (
                  <p key={i}>
                    {sources[c.source]} diz {money(c.valueCents, c.currency)} ({TIPOS[c.type] ?? c.type})
                  </p>
                ))}
              </div>
            )}

            {selected.evidence?.length ? (
              <section>
                <h3 className="text-apoio font-medium text-ink-mute">Como o sistema sabe</h3>
                <ol className="mt-2 space-y-2.5">
                  {selected.evidence.map((e) => (
                    <li key={e.id} className="rounded-xl border border-line px-3.5 py-3">
                      <p className="font-medium text-ink">
                        {TIPOS[e.type] ?? sources[e.source]}
                        {e.valueCents !== null ? `, ${money(e.valueCents, e.currency)}` : ""}
                      </p>
                      <p className="text-apoio text-ink-mute">
                        {new Date(e.occurredAt).toLocaleString("pt-BR")}, {e.actorName ?? "registrado automaticamente"}
                      </p>
                      {e.payload?.text && <blockquote className="mt-2 border-l-2 border-line pl-3 text-ink-soft">“{e.payload.text}”</blockquote>}
                      {e.payload?.reason && <p className="mt-1 text-ink-soft">{e.payload.reason}</p>}
                      {e.payload?.notes && <p className="mt-1 text-ink-soft">{e.payload.notes}</p>}
                      {e.payload?.coverage && e.payload.coverage !== "COMPLETE" && (
                        <p className="mt-1 text-apoio text-ink-mute">
                          {e.payload.coverage === "PARTIAL" ? "Só parte da conversa foi lida." : "Não se sabe quanto da conversa foi lido."}
                        </p>
                      )}
                      {e.payload?.legacy && (
                        <p className="mt-1 text-apoio text-warning">Registro do modelo anterior, sem nova confirmação.</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {!!selected.conversionEvents?.length && (
              <section>
                <h3 className="text-apoio font-medium text-ink-mute">Avisado à Meta</h3>
                <ul className="mt-2 space-y-1 text-ink-soft">
                  {selected.conversionEvents.map((e, i) => (
                    <li key={i}>
                      {EVENTOS_DA_META[e.type] ?? e.type}:{" "}
                      {e.status === "SENT" ? "enviado" : e.status === "FAILED" ? "não foi aceito" : "na fila"}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {canManage && (
              <form onSubmit={review} className="space-y-4 border-t border-line pt-5">
                {!selected.lead && (
                  <div className="space-y-2">
                    <label className={ROTULO}>
                      De qual lead é esta venda
                      {selected.identityCandidates?.length ? (
                        <Select name="leadId">
                          <option value="">Escolha o cliente</option>
                          {selected.identityCandidates.map((lead) => (
                            <option key={lead.id} value={lead.id}>
                              {lead.name ? `${lead.name}, ${formataTelefone(lead.normalizedPhone)}` : formataTelefone(lead.normalizedPhone)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input name="leadId" placeholder="Código do lead, do endereço da página dele" />
                      )}
                    </label>
                    <Button name="action" value="LINK" variant="secondary" size="sm" disabled={busy}>
                      Associar ao lead
                    </Button>
                  </div>
                )}
                <label className={ROTULO}>
                  Valor confirmado
                  <Input
                    name="value"
                    inputMode="decimal"
                    defaultValue={selected.amountCents === null ? "" : (selected.amountCents / 100).toFixed(2).replace(".", ",")}
                  />
                </label>
                <label className={ROTULO}>
                  Observação
                  <Textarea name="notes" rows={2} maxLength={2000} />
                </label>
                {!!selected.conflicts?.length && (
                  <label className={ROTULO}>
                    Qual informação vale
                    <Select name="evidence">
                      <option value="">Escolha para resolver</option>
                      {selected.evidence
                        ?.filter((e) => e.source !== "CONVERSATION")
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {sources[e.source]}, {money(e.valueCents, e.currency)}
                          </option>
                        ))}
                    </Select>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button name="action" value="CONFIRM" disabled={busy}>
                    Confirmar venda
                  </Button>
                  {!!selected.conflicts?.length && (
                    <Button name="action" value="RESOLVE" variant="secondary" disabled={busy}>
                      Resolver
                    </Button>
                  )}
                  <Button name="action" value="REJECT" variant="ghost" disabled={busy}>
                    Não foi venda
                  </Button>
                  <Button name="action" value="CANCEL" variant="ghost" disabled={busy}>
                    Cancelar venda
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

/** O que cada evidência é, em palavras de quem vende. */
const TIPOS: Record<string, string> = {
  MESSAGE: "Mensagem na conversa",
  SALE_INTENT: "Cliente disse que vai fechar",
  PAYMENT_INTENT: "Cliente falou em pagamento",
  CRM_WON: "Ganha no CRM",
  CRM_LOST: "Perdida no CRM",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_REFUNDED: "Pagamento devolvido",
  ERP_ORDER: "Pedido no sistema da empresa",
  ECOMMERCE_ORDER: "Pedido na loja",
  MANUAL_CONFIRMATION: "Confirmada por alguém da equipe",
  MANUAL_REJECTION: "Recusada por alguém da equipe",
  EXTERNAL_API: "Enviada por outro sistema",
};

const EVENTOS_DA_META: Record<string, string> = {
  LEAD: "Lead",
  QUALIFIED_LEAD: "Lead qualificado",
  PURCHASE: "Compra",
};
