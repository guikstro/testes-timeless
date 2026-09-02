"use client";

import { useActionState } from "react";
import { DisqualifyState, setDisqualified, updateLead, UpdateLeadState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: UpdateLeadState = {};
const initialDisqualifyState: DisqualifyState = {};

export type LeadStage = "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

const STAGE_RANK: Record<LeadStage, number> = { NEW: 0, QUALIFIED: 1, MEETING_SCHEDULED: 2, WON: 3 };

export function ManualEditForm({ leadId, status }: { leadId: string; status: LeadStage }) {
  const action = updateLead.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <select
        name="status"
        defaultValue=""
        className="h-10 w-full rounded-xl border border-line bg-panel px-3 text-corpo text-ink shadow-subtle transition-all duration-200 ease-soft hover:border-ink/20 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
      >
        <option value="">Manter status atual</option>
        {/* O status só avança: oferecer um estágio já passado geraria um erro previsível. */}
        {STAGE_RANK[status] < STAGE_RANK.QUALIFIED ? (
          <option value="QUALIFIED">Marcar como Qualificado</option>
        ) : null}
        {STAGE_RANK[status] < STAGE_RANK.MEETING_SCHEDULED ? (
          <option value="MEETING_SCHEDULED">Marcar reunião agendada</option>
        ) : null}
        {STAGE_RANK[status] < STAGE_RANK.WON ? <option value="WON">Marcar como Venda</option> : null}
      </select>
      <input
        name="revenueReais"
        placeholder="Receita em R$ (opcional)"
        inputMode="decimal"
        className="h-10 w-full rounded-xl border border-line bg-panel px-3 text-corpo text-ink shadow-subtle transition-all duration-200 ease-soft placeholder:text-ink-mute hover:border-ink/20 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
      />
      <Button type="submit" loading={pending} size="sm" className="w-full">{pending ? "Salvando..." : "Salvar correção"}</Button>
      {state.error ? <p className="text-apoio text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}

export function DisqualifyForm({
  leadId,
  disqualifiedAt,
  disqualifiedReason,
  isWon,
}: {
  leadId: string;
  disqualifiedAt: string | null;
  disqualifiedReason: string | null;
  isWon: boolean;
}) {
  const action = setDisqualified.bind(null, leadId, !disqualifiedAt);
  const [state, formAction, pending] = useActionState(action, initialDisqualifyState);

  // Uma venda registrada contradiz "não era oportunidade" — a API recusa, e a
  // tela não oferece o botão em vez de deixar o usuário descobrir pelo erro.
  if (isWon && !disqualifiedAt) {
    return null;
  }

  if (disqualifiedAt) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-soft">
          Desqualificado em {new Date(disqualifiedAt).toLocaleString("pt-BR")}
          {disqualifiedReason ? `. Motivo: ${disqualifiedReason}` : ""}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-panel-soft disabled:opacity-50"
        >
          {pending ? "Reativando..." : "Reativar lead"}
        </button>
        {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input
        name="reason"
        placeholder="Motivo (opcional)"
        maxLength={200}
        className="min-w-[200px] flex-1 rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-panel-soft disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Desqualificar"}
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
