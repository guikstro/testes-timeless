"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Busca e filtros da lista.
 *
 * O estado vive na URL, não no componente: assim um filtro pode ser
 * compartilhado por link, sobrevive ao recarregar e volta certo no botão
 * "voltar" do navegador.
 */
export function LeadsFilters({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  // Os chips por estágio saíram: o quadro já mostra os estágios como colunas,
  // e um filtro que esconde três das quatro desmancharia a leitura do funil.
  // Sobrou o recorte que o quadro não expressa sozinho.
  const soAguardando = params.get("aguardando") === "1";
  const [texto, setTexto] = useState(params.get("search") ?? "");
  const primeiraRenderizacao = useRef(true);

  useEffect(() => {
    // Sem a espera, cada tecla dispararia uma consulta ao servidor. 350ms é o
    // intervalo em que a pessoa termina de digitar uma palavra.
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (texto.trim()) novos.set("search", texto.trim());
      else novos.delete("search");
      novos.delete("page");
      iniciar(() => router.replace(`${pathname}?${novos.toString()}`));
    }, 350);
    return () => window.clearTimeout(t);
    // `params` fora das dependências de propósito: incluí-lo relançaria a
    // espera a cada navegação, inclusive as que este próprio efeito causa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, pathname, router]);

  function alternarAguardando() {
    const novos = new URLSearchParams(params.toString());
    if (soAguardando) novos.delete("aguardando");
    else novos.set("aguardando", "1");
    iniciar(() => router.replace(`${pathname}?${novos.toString()}`));
  }

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          aria-label="Buscar leads"
          className="h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-4 text-sm text-ink shadow-subtle transition-all duration-200 ease-soft placeholder:text-ink-mute hover:border-ink/20 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        />
        {pendente ? (
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-ink-mute" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alternarAguardando}
          aria-pressed={soAguardando}
          className={`focus-ring inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-corpo transition-all duration-200 ease-soft active:scale-95 ${
            soAguardando
              ? "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300"
              : "border border-line bg-panel text-ink-soft hover:border-ink/20 hover:text-ink"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5">
            {soAguardando ? (
              <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
            ) : null}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          </span>
          Aguardando você
        </button>

        <span className="ml-auto text-corpo tabular-nums text-ink-mute">
          {total} {total === 1 ? "lead" : "leads"}
        </span>
      </div>
    </div>
  );
}
