"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { OrgLogo } from "@/components/ui/logo";
import { brandPalette } from "@/lib/brand";
import { BrandState, updateBrand } from "./actions";

const initialState: BrandState = {};

const PRESETS = ["#2563EB", "#7C3AED", "#0F766E", "#B45309", "#BE123C", "#0F172A"];

export function BrandForm({
  organizationName,
  logoUrl,
  brandColor,
}: {
  organizationName: string;
  logoUrl: string | null;
  brandColor: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateBrand, initialState);
  // Estado local só para a prévia: mostrar o resultado antes de salvar evita
  // o ciclo "salva, vê feio, volta, corrige".
  const [url, setUrl] = useState(logoUrl ?? "");
  const [color, setColor] = useState(brandColor ?? "#2563EB");

  const preview = brandPalette(color);

  return (
    <form action={formAction} className="grid gap-6 sm:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-4">
        <Field label="Endereço da logo" hint="Precisa ser um endereço https. Deixe em branco para usar a inicial.">
          {(id) => (
            <Input
              id={id}
              name="logoUrl"
              type="url"
              inputMode="url"
              placeholder="https://suaempresa.com/logo.png"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          )}
        </Field>

        <Field label="Cor da marca" hint="Tinge botões, destaques e o item ativo do menu.">
          {(id) => (
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={id}
                name="brandColor"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-10 w-14 cursor-pointer rounded-xl border border-line bg-panel p-1 shadow-subtle"
              />
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  aria-label={`Usar a cor ${preset}`}
                  aria-pressed={color.toLowerCase() === preset.toLowerCase()}
                  style={{ backgroundColor: preset }}
                  className="focus-ring h-7 w-7 rounded-lg shadow-subtle transition-transform duration-200 ease-soft hover:scale-110 active:scale-95 aria-pressed:ring-2 aria-pressed:ring-ink aria-pressed:ring-offset-2"
                />
              ))}
            </div>
          )}
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            {pending ? "Salvando" : "Salvar identidade"}
          </Button>
          {state.savedAt ? (
            <span key={state.savedAt} className="animate-fade-in text-[13px] text-emerald-600">
              Identidade atualizada
            </span>
          ) : null}
          {state.error ? <span className="animate-fade-in text-[13px] text-red-600">{state.error}</span> : null}
        </div>
      </div>

      {/* Prévia ao vivo, com as variáveis aplicadas só neste bloco. */}
      <div
        className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-line/70 bg-panel-soft p-6 sm:w-56"
        style={
          {
            "--brand": preview.base,
            "--brand-soft": preview.soft,
            "--brand-ink": preview.ink,
          } as React.CSSProperties
        }
      >
        <OrgLogo name={organizationName} logoUrl={url || null} className="h-12 w-12" />
        <p className="font-display text-sm font-semibold text-ink">{organizationName}</p>
        <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11.5px] font-medium text-brand-ink">
          Item ativo
        </span>
        <span className="h-9 w-full rounded-xl bg-brand shadow-subtle" />
        <p className="text-[11px] text-ink-mute">Prévia</p>
      </div>
    </form>
  );
}
