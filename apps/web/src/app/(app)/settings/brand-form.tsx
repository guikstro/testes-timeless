"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { OrgLogo } from "@/components/ui/logo";
import { brandPalette } from "@/lib/brand";
import { BrandState, updateBrand } from "./actions";

const initialState: BrandState = {};

/**
 * Doze cores prontas, cobrindo a roda inteira.
 *
 * Todas escuras e saturadas o bastante para servirem de acento: um tom claro
 * demais desaparece sobre o marfim do tema claro, e um tom lavado não
 * consegue destacar nada. Quem quiser exatamente a cor da própria marca usa o
 * seletor ao lado; estas existem para quem não tem uma e não quer decidir.
 */
const PRESETS: { hex: string; nome: string }[] = [
  { hex: "#007D5E", nome: "Verde Timeless" },
  { hex: "#059669", nome: "Esmeralda" },
  { hex: "#0F766E", nome: "Verde-azulado" },
  { hex: "#0E7490", nome: "Ciano" },
  { hex: "#2563EB", nome: "Azul" },
  { hex: "#4F46E5", nome: "Índigo" },
  { hex: "#7C3AED", nome: "Roxo" },
  { hex: "#DB2777", nome: "Rosa" },
  { hex: "#BE123C", nome: "Carmim" },
  { hex: "#EA580C", nome: "Laranja" },
  { hex: "#B45309", nome: "Âmbar" },
  { hex: "#334155", nome: "Grafite" },
];

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
  const [color, setColor] = useState(brandColor ?? "#007D5E");

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
                  key={preset.hex}
                  type="button"
                  onClick={() => setColor(preset.hex)}
                  title={preset.nome}
                  aria-label={`Usar a cor ${preset.nome}`}
                  aria-pressed={color.toLowerCase() === preset.hex.toLowerCase()}
                  style={{ backgroundColor: preset.hex }}
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
            <span key={state.savedAt} className="animate-fade-in text-corpo text-emerald-600">
              Identidade atualizada
            </span>
          ) : null}
          {state.error ? <span className="animate-fade-in text-corpo text-red-600">{state.error}</span> : null}
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
        <span className="rounded-full bg-brand-soft px-2.5 py-1 text-rotulo font-medium text-brand-ink">
          Item ativo
        </span>
        <span className="h-9 w-full rounded-xl bg-brand shadow-subtle" />
        <p className="text-rotulo text-ink-mute">Prévia</p>
      </div>
    </form>
  );
}
