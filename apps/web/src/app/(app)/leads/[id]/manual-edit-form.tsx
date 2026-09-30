"use client";

import { useActionState, useState } from "react";
import { DisqualifyState, setDisqualified, updateLead, UpdateLeadState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOTIVOS_DE_PERDA } from "@/lib/leads/acompanhamento";

const initialState: UpdateLeadState = {};
const initialDisqualifyState: DisqualifyState = {};

export type LeadStage = "NEW" | "IN_PROGRESS" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

const STAGE_RANK: Record<LeadStage, number> = { NEW: 0, IN_PROGRESS: 1, QUALIFIED: 2, MEETING_SCHEDULED: 3, WON: 4 };

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
        {STAGE_RANK[status] < STAGE_RANK.IN_PROGRESS ? (
          <option value="IN_PROGRESS">Marcar como Em atendimento</option>
        ) : null}
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
      {state.error ? <p className="text-apoio text-danger">{state.error}</p> : null}
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
  const [motivo, setMotivo] = useState("");

  // Uma venda registrada contradiz "não era oportunidade" — a API recusa, e a
  // tela não oferece o botão em vez de deixar o usuário descobrir pelo erro.
  if (isWon && !disqualifiedAt) {
    return null;
  }

  if (disqualifiedAt) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <p className="text-corpo text-ink-soft">
          Perdido em {new Date(disqualifiedAt).toLocaleString("pt-BR")}
          {disqualifiedReason ? `. Motivo: ${disqualifiedReason}` : ""}
        </p>
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Reativar lead
        </Button>
        {state.error ? <p className="w-full text-corpo text-danger">{state.error}</p> : null}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      {/* Os motivos mais comuns num toque, para a perda ser contável depois; ainda dá para escrever outro. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivos comuns">
        {MOTIVOS_DE_PERDA.map((comum) => (
          <button
            key={comum}
            type="button"
            onClick={() => setMotivo(comum)}
            aria-pressed={motivo === comum}
            className={`focus-ring rounded-full px-2.5 py-1 text-rotulo font-medium transition-colors duration-200 ease-soft ${
              motivo === comum ? "bg-ink text-canvas" : "bg-panel-soft text-ink-soft hover:text-ink"
            }`}
          >
            {comum}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          name="reason"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder="Motivo da perda (opcional)"
          maxLength={200}
          aria-label="Motivo da perda"
          className="h-9 w-auto min-w-[12rem] flex-1"
        />
        <Button type="submit" size="sm" variant="danger" loading={pending}>
          Marcar como perdido
        </Button>
      </div>
      {state.error ? <p className="text-corpo text-danger">{state.error}</p> : null}
    </form>
  );
}
