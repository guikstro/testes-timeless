"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { APARENCIA, Estagio, ORDEM } from "./estagios";
import { LeadCard, LeadCartao } from "./lead-card";
import { moverEstagio } from "./actions";



/**
 * Quadro do funil.
 *
 * As colunas são os estágios, na ordem em que o negócio acontece, então a
 * própria tela ensina o funil. Arrastar move o lead adiante.
 *
 * O estágio só anda para frente, que é regra do domínio e não limitação da
 * tela: um lead que já comprou não "volta" a ser novo. Por isso a coluna
 * recusa visualmente o que não pode receber, em vez de aceitar o gesto e
 * mostrar erro depois.
 */
export interface ColunaDoQuadro {
  estagio: Estagio;
  itens: LeadCartao[];
  /** Total no servidor, que pode ser maior que o carregado. */
  total: number;
}

export function LeadBoard({ colunas }: { colunas: ColunaDoQuadro[] }) {
  const router = useRouter();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Estagio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const todos = colunas.flatMap((coluna) => coluna.itens);
  const leadArrastado = todos.find((lead) => lead.id === arrastando) ?? null;

  function podeReceber(destino: Estagio): boolean {
    if (!leadArrastado) return false;
    return ORDEM[destino] > ORDEM[leadArrastado.status];
  }

  function soltar(destino: Estagio) {
    setSobre(null);
    const lead = leadArrastado;
    setArrastando(null);
    // NEW nunca é destino: o funil só anda para frente, então nada volta
    // para "novo". O tipo estreito aqui é o que garante isso em compilação.
    if (!lead || destino === "NEW" || !podeReceber(destino)) return;

    setErro(null);
    iniciar(async () => {
      const resultado = await moverEstagio(lead.id, destino);
      if (resultado?.error) setErro(resultado.error);
      else router.refresh();
    });
  }

  return (
    <div className="relative">
      {erro ? (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] text-red-700 dark:text-red-300">
          {erro}
        </p>
      ) : null}

      <div className={`grid grid-cols-1 gap-4 transition-opacity duration-300 sm:grid-cols-2 xl:grid-cols-4 ${pendente ? "opacity-60" : ""}`}>
        {colunas.map((coluna) => {
          const { titulo, cor } = APARENCIA[coluna.estagio];
          const daColuna = coluna.itens;
          const recebe = arrastando !== null && podeReceber(coluna.estagio);
          const recusa = arrastando !== null && !podeReceber(coluna.estagio);

          return (
            <section
              key={coluna.estagio}
              onDragOver={(evento) => {
                if (!recebe) return;
                // Sem o preventDefault o navegador recusa o solte por padrão.
                evento.preventDefault();
                setSobre(coluna.estagio);
              }}
              onDragLeave={() => setSobre((atual) => (atual === coluna.estagio ? null : atual))}
              onDrop={(evento) => {
                evento.preventDefault();
                soltar(coluna.estagio);
              }}
              className={`flex min-h-[12rem] flex-col rounded-2xl border p-3 transition-all duration-300 ease-soft ${
                sobre === coluna.estagio
                  ? "border-accent bg-accent/[0.06] ring-4 ring-accent/10"
                  : recebe
                    ? "border-dashed border-accent/40 bg-panel/60"
                    : recusa
                      ? "border-line/40 bg-panel/30 opacity-50"
                      : "border-line/70 bg-panel/60"
              }`}
            >
              <header className="mb-3 flex items-center gap-2 px-1">
                <span className={`h-2 w-2 rounded-full ${cor}`} aria-hidden />
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-soft">{titulo}</h2>
                <span
                  className="ml-auto rounded-full bg-panel-soft px-2 py-0.5 text-[11px] tabular-nums text-ink-mute"
                  title={coluna.total > daColuna.length ? `${daColuna.length} de ${coluna.total} carregados` : undefined}
                >
                  {coluna.total}
                </span>
              </header>

              <ul className="flex flex-1 flex-col gap-2.5">
                {daColuna.map((lead, indice) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    indice={indice}
                    // Quem já comprou não tem para onde ir; arrastar seria um
                    // gesto que nunca dá certo.
                    arrastavel={lead.status !== "WON" && !lead.disqualifiedAt}
                    onArrastar={setArrastando}
                  />
                ))}

                {daColuna.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line/60 py-8 text-[12px] text-ink-mute">
                    {recebe ? "Solte aqui" : "Vazio"}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
