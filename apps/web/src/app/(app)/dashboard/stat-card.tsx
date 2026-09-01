"use client";

import { CountUp, FormatoNumero, formataNumero } from "@/components/ui/count-up";
import { Delta } from "@/components/ui/delta";
import { Sparkline } from "@/components/ui/sparkline";

/**
 * Cartão de métrica.
 *
 * Três camadas de leitura, nesta ordem de importância: o número responde
 * "quanto", a variação responde "melhor ou pior que antes", e a minicurva
 * responde "como chegou aqui". Um número sozinho não responde nenhuma das
 * outras duas, e é isso que fazia o painel anterior parecer monótono.
 */
export function StatCard({
  rotulo,
  numero,
  formato = "inteiro",
  delta,
  anterior,
  serie,
  nota,
  invertido = false,
}: {
  rotulo: string;
  numero: number;
  /* Palavra e não função: o servidor não consegue passar função para um
     componente de cliente, e a tentativa quebra a página em execução. */
  formato?: FormatoNumero;
  delta?: number | null;
  anterior?: number;
  serie?: number[];
  nota?: string;
  invertido?: boolean;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-subtle transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-card">
      {/* Halo revelado sob o ponteiro, na cor da marca. */}
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-soft group-hover:opacity-100 [background:radial-gradient(120%_70%_at_50%_-10%,rgb(var(--accent)/0.10),transparent)]" />

      <p className="relative text-[11px] font-medium uppercase tracking-[0.1em] text-ink-mute">{rotulo}</p>

      <p className="relative mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-ink">
        <CountUp value={numero} formato={formato} />
      </p>

      <div className="relative mt-1.5 flex items-center gap-2">
        {delta !== undefined ? <Delta delta={delta} invertido={invertido} /> : null}
        {anterior !== undefined && delta !== null ? (
          <span className="text-[11px] text-ink-mute" title="Mesmo período anterior">
            de {formataNumero(anterior, formato)}
          </span>
        ) : null}
      </div>

      {nota ? <p className="relative mt-1 text-[11.5px] text-ink-mute">{nota}</p> : null}

      {serie && serie.length > 1 ? (
        <div className="relative mt-3 -mb-1">
          <Sparkline pontos={serie} />
        </div>
      ) : null}
    </div>
  );
}
