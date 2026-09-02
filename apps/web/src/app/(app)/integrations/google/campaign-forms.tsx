"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCentsAsBRL } from "@/lib/currency";
import { criarCampanha, EstadoFormulario, lancarGasto, removerCampanha } from "./actions";
import { ImportarCsv } from "./csv-import";

const inicial: EstadoFormulario = {};

const campo =
  "h-10 w-full rounded-xl border border-line bg-panel px-3 text-corpo text-ink shadow-subtle " +
  "transition-all duration-200 ease-soft placeholder:text-ink-mute hover:border-ink/20 " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";

export function NovaCampanha() {
  const [estado, acao, pendente] = useActionState(criarCampanha, inicial);

  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <div>
        <label htmlFor="g-nome" className="mb-1.5 block text-apoio font-medium text-ink-soft">
          Nome da campanha
        </label>
        <input id="g-nome" name="name" required placeholder="Busca marca, Performance Max" className={campo} />
      </div>

      <div>
        <label htmlFor="g-id" className="mb-1.5 block text-apoio font-medium text-ink-soft">
          ID da campanha <span className="font-normal text-ink-mute">(opcional)</span>
        </label>
        <input id="g-id" name="externalId" placeholder="1234567890" inputMode="numeric" className={campo} />
      </div>

      <div className="flex items-end">
        <Button type="submit" loading={pendente} className="w-full sm:w-auto">
          {pendente ? "Criando" : "Adicionar"}
        </Button>
      </div>

      {estado.error ? (
        <p className="text-apoio text-red-600 dark:text-red-400 sm:col-span-3">{estado.error}</p>
      ) : null}
    </form>
  );
}

export function LancarGasto({ campaignId }: { campaignId: string }) {
  const acaoLigada = lancarGasto.bind(null, campaignId);
  const [estado, acao, pendente] = useActionState(acaoLigada, inicial);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form action={acao} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-rotulo text-ink-mute">Dia</label>
        <input type="date" name="date" defaultValue={hoje} max={hoje} required className={`${campo} w-[9.5rem]`} />
      </div>
      <div>
        <label className="mb-1 block text-rotulo text-ink-mute">Gasto em R$</label>
        <input name="reais" placeholder="250,00" inputMode="decimal" required className={`${campo} w-28`} />
      </div>
      <Button type="submit" loading={pendente} size="sm" variant="secondary">
        {pendente ? "Salvando" : "Lançar"}
      </Button>
      {estado.savedAt ? (
        <span key={estado.savedAt} className="animate-fade-in text-apoio text-accent">
          Lançado
        </span>
      ) : null}
      {estado.error ? <span className="text-apoio text-red-600 dark:text-red-400">{estado.error}</span> : null}
    </form>
  );
}

export function CartaoCampanha({
  id,
  nome,
  externalId,
  manual,
  gastoTotal,
  diasLancados,
}: {
  id: string;
  nome: string;
  externalId: string;
  manual: boolean;
  gastoTotal: number;
  diasLancados: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    setRemovendo(true);
    setErro(null);
    const resultado = await removerCampanha(id);
    if (resultado?.error) {
      setErro(resultado.error);
      setRemovendo(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-subtle transition-shadow duration-300 hover:shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{nome}</p>
          <p className="mt-0.5 text-rotulo text-ink-mute">
            {externalId.startsWith("manual:") ? "Sem ID informado" : `ID ${externalId}`}
            {diasLancados > 0 ? ` · ${diasLancados} dia(s) lançado(s)` : " · sem gasto lançado"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-destaque font-semibold tabular-nums text-ink">{formatCentsAsBRL(gastoTotal)}</span>
          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
            className="focus-ring rounded-lg border border-line px-2.5 py-1 text-apoio text-ink-soft transition-colors hover:border-ink/25 hover:text-ink"
          >
            {aberto ? "Fechar" : "Lançar gasto"}
          </button>
        </div>
      </div>

      {aberto ? (
        <div className="animate-rise-in mt-4 border-t border-line/60 pt-4">
          <ImportarCsv campaignId={id} />

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-line/60" />
            <span className="text-rotulo uppercase tracking-wide text-ink-mute">ou lance um dia</span>
            <span className="h-px flex-1 bg-line/60" />
          </div>

          <LancarGasto campaignId={id} />

          {manual ? (
            <div className="mt-4 flex items-center gap-3 border-t border-line/60 pt-3">
              <button
                type="button"
                onClick={remover}
                disabled={removendo}
                className="focus-ring rounded-lg text-apoio text-red-600 underline decoration-red-300 underline-offset-4 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400"
              >
                {removendo ? "Removendo" : "Remover campanha"}
              </button>
              {erro ? <span className="text-apoio text-red-600 dark:text-red-400">{erro}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
