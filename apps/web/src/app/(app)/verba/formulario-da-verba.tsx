"use client";

import { useActionState, useEffect, useRef } from "react";
import { EstadoDaVerba, salvarVerba } from "./verba-actions";
import { Verba } from "./tipos";

const inicial: EstadoDaVerba = {};

const CAMPO =
  "h-11 w-full rounded-xl border border-line bg-panel px-3 text-corpo text-ink transition-colors " +
  "placeholder:text-ink-mute/60 focus:border-accent focus:outline-none";

const ROTULO = "mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute";

export function FormularioDaVerba({ verba }: { verba?: Verba }) {
  const [estado, acao, enviando] = useActionState(salvarVerba, inicial);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.okEm && !verba) form.current?.reset();
  }, [estado.okEm, verba]);

  return (
    <form ref={form} action={acao} className="space-y-4">
      {verba ? <input type="hidden" name="id" value={verba.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="verba-valor" className={ROTULO}>
            Valor da verba
          </label>
          <input
            id="verba-valor"
            name="valor"
            required
            inputMode="decimal"
            placeholder="5.000,00"
            defaultValue={verba ? (verba.amountCents / 100).toFixed(2).replace(".", ",") : ""}
            className={`${CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="verba-rotulo" className={ROTULO}>
            Como chamar <span className="normal-case tracking-normal text-ink-mute/70">(opcional)</span>
          </label>
          <input
            id="verba-rotulo"
            name="rotulo"
            maxLength={60}
            placeholder="Setembro"
            defaultValue={verba?.label ?? ""}
            className={CAMPO}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="verba-de" className={ROTULO}>
            Vale a partir de
          </label>
          <input
            id="verba-de"
            name="de"
            type="date"
            required
            defaultValue={verba?.startsOn.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}
            className={CAMPO}
          />
        </div>
        <div>
          {/*
            Fim opcional de propósito: as duas formas reais são diferentes.
            Verba mensal tem fim de mês; depósito de crédito vale até acabar.
          */}
          <label htmlFor="verba-ate" className={ROTULO}>
            Até <span className="normal-case tracking-normal text-ink-mute/70">(vazio = até acabar)</span>
          </label>
          <input
            id="verba-ate"
            name="ate"
            type="date"
            defaultValue={verba?.endsOn?.slice(0, 10) ?? ""}
            className={CAMPO}
          />
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
          {estado.erro}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enviando}
          aria-busy={enviando || undefined}
          className="focus-ring inline-flex h-11 items-center rounded-full bg-accent px-6 text-corpo font-semibold text-accent-contrast transition-all duration-300 ease-soft hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
        >
          {enviando ? "Salvando" : verba ? "Atualizar verba" : "Declarar verba"}
        </button>
        {estado.okEm ? (
          <span role="status" className="text-corpo text-ink-mute">
            Salvo.
          </span>
        ) : null}
      </div>
    </form>
  );
}
