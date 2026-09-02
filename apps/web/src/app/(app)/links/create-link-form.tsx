"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTrackingLink, CreateLinkState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PLATAFORMAS } from "./plataformas";

const initialState: CreateLinkState = {};

export function CreateLinkForm() {
  const [state, formAction, pending] = useActionState(createTrackingLink, initialState);
  const [plataforma, setPlataforma] = useState(PLATAFORMAS[0]);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.criadoEm) {
      form.current?.reset();
      setPlataforma(PLATAFORMAS[0]);
    }
  }, [state.criadoEm]);

  const escreveAMao = plataforma.chave === "outro";

  return (
    <form ref={form} action={formAction} className="surface space-y-4 p-5">
      <div>
        <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Onde este link vai</p>
        {/*
          A plataforma vem primeiro porque ela preenche a origem e o meio. Sem
          isso a pessoa digita "Facebook" num link e "facebook-ads" no outro, e
          o relatório passa a mostrar duas origens para a mesma coisa.
        */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLATAFORMAS.map((opcao) => {
            const ativa = opcao.chave === plataforma.chave;
            return (
              <button
                key={opcao.chave}
                type="button"
                onClick={() => setPlataforma(opcao)}
                aria-pressed={ativa}
                title={opcao.descricao}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-apoio font-medium transition-all duration-200 ease-soft active:scale-95 ${
                  ativa
                    ? "border-transparent bg-ink text-canvas shadow-subtle"
                    : "border-line text-ink-soft hover:border-ink/25 hover:text-ink"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: opcao.cor }} aria-hidden />
                {opcao.rotulo}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-rotulo text-ink-mute">{plataforma.descricao}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do link" hint="Só para você encontrar depois.">
          {(id) => <Input id={id} name="name" placeholder="Google | Rescisão | Busca" required />}
        </Field>
        <Field label="Para onde ele leva" hint="O WhatsApp da empresa, ou uma página sua.">
          {(id) => (
            <Input id={id} name="destinationUrl" type="url" placeholder="https://wa.me/5585999999999" required />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Origem" hint={escreveAMao ? "Ex.: parceiro, evento." : "Preenchida pela plataforma."}>
          {(id) => (
            <Input
              id={id}
              name="defaultSource"
              // `key` força o campo a assumir o valor novo ao trocar de
              // plataforma: sem isso, o padrão só valeria na primeira pintura.
              key={`source-${plataforma.chave}`}
              defaultValue={plataforma.source}
              readOnly={!escreveAMao}
              placeholder={escreveAMao ? "de onde vem" : undefined}
              className={escreveAMao ? undefined : "bg-panel-soft text-ink-mute"}
            />
          )}
        </Field>
        <Field label="Meio" hint={escreveAMao ? "Ex.: orgânico, impresso." : "Preenchido pela plataforma."}>
          {(id) => (
            <Input
              id={id}
              name="defaultMedium"
              key={`medium-${plataforma.chave}`}
              defaultValue={plataforma.medium}
              readOnly={!escreveAMao}
              placeholder={escreveAMao ? "como vem" : undefined}
              className={escreveAMao ? undefined : "bg-panel-soft text-ink-mute"}
            />
          )}
        </Field>
        <Field label="Campanha" hint="Opcional, para separar dentro da mesma origem.">
          {(id) => <Input id={id} name="defaultCampaign" placeholder="rescisao-setembro" />}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Criando..." : "Criar link"}
        </Button>
        {state.error ? (
          <p className="text-apoio text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : state.criadoEm ? (
          <p className="text-apoio text-emerald-700 dark:text-emerald-400" role="status">
            Link criado. Ele aparece na lista abaixo.
          </p>
        ) : null}
      </div>
    </form>
  );
}
