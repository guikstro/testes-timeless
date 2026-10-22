"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CONJUNTOS, Conjunto, METRICAS, Metrica, alterna, metricasDoConjunto } from "@/lib/campanhas/metricas";

const CHAVE = "timeless:colunas-de-campanhas";

/**
 * O botão "Colunas" da tabela técnica.
 *
 * A fileira de onze opções sempre à vista fazia a tela parecer o Gerenciador
 * de Anúncios. Agora as colunas se escolhem num painel que só abre quando
 * alguém quer, e a escolha fica guardada neste navegador.
 */
export function SeletorDeColunas({
  metricas,
  escolhaManual,
  sugestao,
  busca,
}: {
  metricas: Metrica[];
  escolhaManual: boolean;
  sugestao: { conjunto: Conjunto; objetivo: string | null };
  /** A consulta da página sem as métricas, para a troca não perder o período. */
  busca: string;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  const endereco = (lista: Metrica[] | null) => {
    const params = new URLSearchParams(busca);
    if (lista) params.set("metricas", lista.join(","));
    else params.delete("metricas");
    return `${caminho}?${params.toString()}`;
  };

  function escolhe(lista: Metrica[] | null) {
    try {
      if (lista) window.localStorage.setItem(CHAVE, lista.join(","));
      else window.localStorage.removeItem(CHAVE);
    } catch {
      // Sem onde guardar, vale para esta visita.
    }
    router.push(endereco(lista), { scroll: false });
  }

  // Sem escolha na URL, volta a que a pessoa guardou da última vez.
  useEffect(() => {
    if (escolhaManual) return;
    let guardada: string | null = null;
    try {
      guardada = window.localStorage.getItem(CHAVE);
    } catch {
      return;
    }
    const validas = guardada?.split(",").filter((m): m is Metrica => METRICAS.some((d) => d.chave === m)) ?? [];
    if (validas.length) router.replace(endereco(validas), { scroll: false });
    // Só na chegada à página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fecha = (evento: MouseEvent | KeyboardEvent) => {
      if (evento instanceof KeyboardEvent ? evento.key === "Escape" : !painel.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fecha);
    document.addEventListener("keydown", fecha);
    return () => {
      document.removeEventListener("mousedown", fecha);
      document.removeEventListener("keydown", fecha);
    };
  }, [aberto]);

  const conjuntos: Conjunto[] = ["entrega", "conversas", "vendas", "todas"];

  return (
    <div ref={painel} className="relative mb-5 flex justify-end">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        className="focus-ring inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-corpo font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
        Colunas
        <span className="rounded-full bg-panel-soft px-1.5 text-rotulo tabular-nums text-ink-mute">{metricas.length}</span>
      </button>

      {aberto ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-4 shadow-lifted">
          <p className="text-corpo font-semibold text-ink">Mostrar na tabela</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {METRICAS.map((metrica) => {
              const ligada = metricas.includes(metrica.chave);
              return (
                <li key={metrica.chave}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-apoio text-ink-soft hover:text-ink">
                    <input
                      type="checkbox"
                      checked={ligada}
                      onChange={() => escolhe(alterna(metricas, metrica.chave))}
                      className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
                    />
                    {metrica.rotulo}
                  </label>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-apoio font-medium text-ink-soft">Ou comece de um conjunto pronto</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => escolhe(null)}
              className={`focus-ring rounded-full border px-3 py-1 text-apoio ${!escolhaManual ? "border-ink bg-ink text-canvas" : "border-line text-ink-soft hover:text-ink"}`}
            >
              {sugestao.objetivo ? `Pelo objetivo (${sugestao.objetivo.toLowerCase()})` : "Sugeridas"}
            </button>
            {conjuntos.map((conjunto) => (
              <button
                key={conjunto}
                type="button"
                onClick={() => escolhe(metricasDoConjunto(conjunto))}
                className="focus-ring rounded-full border border-line px-3 py-1 text-apoio text-ink-soft hover:text-ink"
              >
                {CONJUNTOS[conjunto].rotulo}
              </button>
            ))}
          </div>
          <p className="mt-3 text-rotulo text-ink-mute">A escolha fica guardada neste navegador.</p>
        </div>
      ) : null}
    </div>
  );
}
