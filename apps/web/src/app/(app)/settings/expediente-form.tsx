"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EstadoDoExpediente, salvarExpediente } from "./expediente-actions";

const inicial: EstadoDoExpediente = {};

/** Domingo primeiro, como no calendário e como no Date do JavaScript. */
const DIAS = [
  { valor: 0, curto: "D", nome: "Domingo" },
  { valor: 1, curto: "S", nome: "Segunda" },
  { valor: 2, curto: "T", nome: "Terça" },
  { valor: 3, curto: "Q", nome: "Quarta" },
  { valor: 4, curto: "Q", nome: "Quinta" },
  { valor: 5, curto: "S", nome: "Sexta" },
  { valor: 6, curto: "S", nome: "Sábado" },
];

/** 570 vira "09:30", que é o formato que o campo de hora espera. */
function paraHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

export function ExpedienteForm({
  ativo: ativoInicial,
  dias: diasIniciais,
  inicio,
  fim,
}: {
  ativo: boolean;
  dias: number[];
  inicio: number;
  fim: number;
}) {
  const [estado, acao, salvando] = useActionState(salvarExpediente, inicial);
  const [ativo, setAtivo] = useState(ativoInicial);
  const [dias, setDias] = useState<number[]>(diasIniciais);

  function alternar(valor: number) {
    setDias((atuais) => (atuais.includes(valor) ? atuais.filter((d) => d !== valor) : [...atuais, valor]));
  }

  return (
    <form action={acao} className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="expedienteAtivo"
          checked={ativo}
          onChange={(evento) => setAtivo(evento.target.checked)}
          className="focus-ring mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[rgb(var(--accent))]"
        />
        <span>
          <span className="block text-corpo font-medium text-ink">
            Contar o tempo de resposta apenas no horário de atendimento
          </span>
          {/*
            O exemplo concreto explica melhor que qualquer definição: é
            exatamente o caso que faz o número atual mentir.
          */}
          <span className="mt-0.5 block text-apoio leading-relaxed text-ink-mute">
            Um lead que chega às 23h e é respondido às 9h passa a contar como poucos minutos, e não como dez horas.
            Desligado, tudo continua sendo medido em relógio corrido.
          </span>
        </span>
      </label>

      <fieldset className={ativo ? "" : "pointer-events-none opacity-45"} aria-disabled={!ativo}>
        <legend className="mb-2 text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">
          Dias de atendimento
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((dia) => {
            const marcado = dias.includes(dia.valor);
            return (
              <button
                key={dia.valor}
                type="button"
                onClick={() => alternar(dia.valor)}
                aria-pressed={marcado}
                title={dia.nome}
                className={`focus-ring h-9 w-9 rounded-full text-corpo font-medium transition-all duration-200 ease-soft active:scale-95 ${
                  marcado ? "bg-ink text-canvas shadow-subtle" : "border border-line text-ink-mute hover:text-ink"
                }`}
              >
                {dia.curto}
                <span className="sr-only">{dia.nome}</span>
              </button>
            );
          })}
        </div>
        {/* Os dias marcados viajam em campos ocultos: um botão não envia valor. */}
        {dias.map((dia) => (
          <input key={dia} type="hidden" name="dias" value={dia} />
        ))}

        <div className="mt-5 grid max-w-md gap-4 sm:grid-cols-2">
          <Field label="Abre às">
            {(id) => <Input id={id} name="inicio" type="time" defaultValue={paraHora(inicio)} required />}
          </Field>
          <Field label="Fecha às">
            {(id) => <Input id={id} name="fim" type="time" defaultValue={paraHora(fim)} required />}
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={salvando}>
          {salvando ? "Salvando..." : "Salvar horário"}
        </Button>
        {estado.erro ? (
          <p className="text-apoio text-red-600 dark:text-red-400" role="alert">
            {estado.erro}
          </p>
        ) : estado.salvoEm ? (
          <p className="text-apoio text-emerald-700 dark:text-emerald-400" role="status">
            Horário salvo. O tempo de resposta no dashboard já reflete a mudança.
          </p>
        ) : null}
      </div>
    </form>
  );
}
