"use client";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { salesRequest } from "../../vendas/sales-workspace";

type Source = {
  id: string;
  name: string;
  type: string;
  credentialPrefix: string | null;
  revokedAt: string | null;
  lastEventAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};
const when = (date: string | null) =>
  date ? new Date(date).toLocaleString("pt-BR") : "Nenhum evento";

export function SalesSources({
  canManage,
  canManageUnits,
  endpoint,
}: {
  canManage: boolean;
  canManageUnits: boolean;
  endpoint: string;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try {
      setSources(await salesRequest<Source[]>("sources"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setToken("");
    try {
      const result = await salesRequest<{ token: string }>("sources", {
        name: data.get("name"),
        type: data.get("type"),
        unitCode: String(data.get("unit") ?? "") || undefined,
      });
      setToken(result.token);
      form.reset();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function credential(id: string, action: "rotate" | "revoke") {
    setBusy(true);
    setError("");
    setToken("");
    try {
      const result = await salesRequest<{ token?: string }>(
        `sources/${id}/${action}`,
        {},
      );
      setToken(result.token ?? "");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await salesRequest("units", {
        name: data.get("name"),
        code: data.get("code"),
      });
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="font-display text-2xl font-semibold">Fontes de vendas</h1>
      <p className="text-ink-soft">
        Conecte seu CRM, ERP, pagamentos ou automações. Cada fonte tem uma
        credencial própria e informa o que confirmou a venda.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {token && (
        <section className="surface space-y-3 p-5">
          <h2 className="font-semibold">Copie sua credencial agora</h2>
          <p className="text-sm text-ink-mute">
            Ela é exibida uma única vez. O TimeLESS guarda apenas o hash.
          </p>
          <Input
            aria-label="Credencial gerada"
            readOnly
            value={token}
            onFocus={(e) => e.target.select()}
          />
          <Button variant="secondary" onClick={() => setToken("")}>
            Já guardei
          </Button>
        </section>
      )}
      {canManage && (
        <form onSubmit={submit} className="surface space-y-4 p-5">
          <h2 className="font-semibold">Nova fonte</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label>
              Nome
              <Input
                name="name"
                required
                maxLength={100}
                placeholder="CRM da equipe"
              />
            </label>
            <label>
              Tipo
              <Select name="type">
                <option value="API">API / automação</option>
                <option value="CRM">CRM</option>
                <option value="PAYMENT">Pagamento</option>
                <option value="ERP">ERP</option>
                <option value="ECOMMERCE">Loja virtual</option>
              </Select>
            </label>
            <label>
              Código da unidade (opcional)
              <Input name="unit" maxLength={60} placeholder="aldeota" />
            </label>
          </div>
          <Button disabled={busy}>Gerar credencial</Button>
        </form>
      )}
      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">Como enviar uma venda</h2>
        <p>
          Envie um <code>POST</code> para:
        </p>
        <code className="block break-all rounded bg-panel-soft p-3">
          {endpoint}
        </code>
        <p>
          Autenticação: <code>Authorization: Bearer SUA_CREDENCIAL</code>
        </p>
        <pre className="overflow-x-auto rounded bg-panel-soft p-4 text-sm">
          {JSON.stringify(
            {
              externalId: "order-8291",
              eventId: "order-8291-won-v1",
              phone: "5585999999999",
              status: "WON",
              valueCents: 250000,
              currency: "BRL",
              occurredAt: "2026-10-07T14:30:00Z",
            },
            null,
            2,
          )}
        </pre>
        <p className="text-sm text-ink-soft">
          Use o mesmo eventId ao reenviar o mesmo evento. Para uma atualização,
          envie um novo eventId e mantenha o externalId do pedido. Estados: WON,
          LOST, CANCELLED e REFUNDED. valueCents é um inteiro em centavos.
        </p>
        <p className="text-sm text-ink-mute">
          A credencial define a organização e, quando configurada, a unidade.
          Você também pode informar unitCode. Para juntar evidências de fontes
          diferentes, envie o saleId retornado pelo TimeLESS.
        </p>
      </section>
      <section aria-busy={loading} className="surface overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Fonte",
                "Estado",
                "Último evento",
                "Último sucesso",
                "Ações",
              ].map((label) => (
                <th key={label} className="p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="p-4">
                  {s.name}
                  <p className="text-ink-mute">{s.type}</p>
                  {s.lastError && <p className="text-danger">{s.lastError}</p>}
                </td>
                <td className="p-4">{s.revokedAt ? "Revogada" : "Ativa"}</td>
                <td className="p-4">{when(s.lastEventAt)}</td>
                <td className="p-4">{when(s.lastSuccessAt)}</td>
                <td className="p-4">
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void credential(s.id, "rotate")}
                      >
                        Trocar chave
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy || !!s.revokedAt}
                        onClick={() => void credential(s.id, "revoke")}
                      >
                        Revogar
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !sources.length && (
          <p className="p-5 text-ink-mute">Nenhuma fonte conectada.</p>
        )}
      </section>
      {canManageUnits && (
        <details className="surface p-5">
          <summary className="cursor-pointer font-medium">
            Adicionar uma unidade (opcional)
          </summary>
          <form onSubmit={unit} className="mt-4 flex flex-wrap items-end gap-3">
            <label>
              Nome
              <Input name="name" required maxLength={100} />
            </label>
            <label>
              Código
              <Input
                name="code"
                required
                pattern="[a-z0-9_-]{1,60}"
                placeholder="aldeota"
              />
            </label>
            <Button disabled={busy}>Adicionar unidade</Button>
          </form>
        </details>
      )}
    </div>
  );
}
