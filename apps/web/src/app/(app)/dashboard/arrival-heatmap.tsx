"use client";

import { useState } from "react";

interface Celula {
  diaSemana: number;
  faixa: number;
  leads: number;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Quando os leads chegam.
 *
 * Responde uma pergunta que nenhum outro painel responde, e que muda escala em
 * vez de campanha: em que momento vale ter gente pronta para atender. Uma
 * operação que descobre metade do movimento na noite de terça remaneja turno,
 * não orçamento de anúncio.
 *
 * A intensidade é proporcional ao pico, não absoluta: o que importa é onde
 * está o movimento desta operação, e não comparar com outra.
 */
export function ArrivalHeatmap({ celulas }: { celulas: Celula[] }) {
  const [ativa, setAtiva] = useState<Celula | null>(null);
  const pico = Math.max(1, ...celulas.map((c) => c.leads));
  const total = celulas.reduce((soma, c) => soma + c.leads, 0);

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-ink-mute">Nenhum lead no período.</p>;
  }

  return (
    <div>
      <div className="flex gap-1.5">
        <div className="flex w-8 shrink-0 flex-col justify-around pt-4 text-right">
          {DIAS.map((dia) => (
            <span key={dia} className="text-rotulo leading-none text-ink-mute">
              {dia}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 grid grid-cols-8 gap-1">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((hora) => (
              <span key={hora} className="text-center text-rotulo leading-none text-ink-mute">
                {String(hora).padStart(2, "0")}h
              </span>
            ))}
          </div>

          <div className="grid grid-rows-7 gap-1">
            {DIAS.map((_, dia) => (
              <div key={dia} className="grid grid-cols-8 gap-1">
                {Array.from({ length: 8 }, (_, faixa) => {
                  const celula = celulas.find((c) => c.diaSemana === dia && c.faixa === faixa) ?? {
                    diaSemana: dia,
                    faixa,
                    leads: 0,
                  };
                  const intensidade = celula.leads / pico;
                  return (
                    <button
                      key={faixa}
                      type="button"
                      onMouseEnter={() => setAtiva(celula)}
                      onFocus={() => setAtiva(celula)}
                      onMouseLeave={() => setAtiva(null)}
                      onBlur={() => setAtiva(null)}
                      aria-label={`${DIAS[dia]}, ${faixa * 3}h: ${celula.leads} leads`}
                      className="focus-ring h-6 rounded-md transition-transform duration-200 ease-soft hover:scale-110"
                      style={{
                        // Piso visível nas células vazias: sem ele a grade some
                        // e o olho perde a referência de onde está.
                        backgroundColor:
                          celula.leads === 0
                            ? "rgb(var(--line) / 0.35)"
                            : `rgb(var(--accent) / ${0.15 + intensidade * 0.75})`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 h-4 text-rotulo text-ink-mute" aria-live="polite">
        {ativa ? (
          <>
            <span className="font-medium text-ink-soft">
              {DIAS[ativa.diaSemana]}, {String(ativa.faixa * 3).padStart(2, "0")}h às{" "}
              {String(ativa.faixa * 3 + 3).padStart(2, "0")}h
            </span>{" "}
            · {ativa.leads} {ativa.leads === 1 ? "lead" : "leads"}
          </>
        ) : (
          "Passe o mouse para ver um horário"
        )}
      </p>
    </div>
  );
}
