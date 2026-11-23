"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

interface Achado {
  tipo: "mensagem" | "lead" | "link";
  titulo: string;
  trecho: string;
  quando?: string;
  leadId?: string;
}

interface Resposta {
  pergunta: string;
  resposta: string | null;
  iaLigada: boolean;
  numeros: { leads7: number; leads30: number; qualificados30: number; clientes30: number };
  achados: Achado[];
}

type Item = { pergunta: string; carregando: boolean; resposta?: Resposta; erro?: string };

const SUGESTOES = [
  "Quantos leads chegaram essa semana?",
  "Qual link trouxe mais leads?",
  "Quem falou em rescisão?",
];

const ROTULO: Record<Achado["tipo"], string> = { mensagem: "Mensagem", lead: "Lead", link: "Link" };

/** Os trechos destacados pelo Postgres vêm entre « ». */
function Destacado({ texto }: { texto: string }) {
  const partes = texto.split(/(«[^»]*»)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("«") ? (
          <mark key={i} className="rounded bg-accent/15 px-0.5 text-ink">{p.slice(1, -1)}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * A barra de perguntas, estilo ChatGPT: abre com ⌘K / Ctrl+K ou pelo botão
 * da faixa do topo. A API busca nas conversas, leads e links da empresa
 * (RAG) e, se a IA estiver ligada, escreve a resposta só com o que achou.
 */
export function BarraDePerguntas() {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
      }
      if (e.key === "Escape") setAberta(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    if (aberta) setTimeout(() => campo.current?.focus(), 30);
  }, [aberta]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [itens]);

  async function pergunta(p: string) {
    const pergunta = p.trim();
    if (pergunta.length < 2) return;
    setTexto("");
    setItens((atual) => [...atual, { pergunta, carregando: true }]);
    const atualiza = (m: Partial<Item>) =>
      setItens((atual) => atual.map((it, i) => (i === atual.length - 1 ? { ...it, ...m, carregando: false } : it)));
    try {
      const r = await fetch("/api/assistente/busca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pergunta }),
      });
      if (!r.ok) {
        atualiza({ erro: r.status === 429 ? "Muitas perguntas seguidas. Espere um minuto." : "Não deu para buscar agora." });
        return;
      }
      atualiza({ resposta: (await r.json()) as Resposta });
    } catch {
      atualiza({ erro: "Sem conexão com o servidor." });
    }
  }

  const envia = (e: FormEvent) => {
    e.preventDefault();
    void pergunta(texto);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="mr-auto flex h-8 w-full max-w-xs items-center gap-2 rounded-full border border-line bg-panel/80 px-3 text-apoio text-ink-mute shadow-subtle transition hover:border-accent/40 hover:text-ink"
        aria-label="Perguntar sobre os seus dados"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="truncate">Pergunte sobre seus leads…</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 text-rotulo sm:inline">⌘K</kbd>
      </button>

      {aberta ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-3 pt-[8vh] backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setAberta(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Perguntas sobre os seus dados"
        >
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-canvas shadow-card">
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {itens.length === 0 ? (
                <div className="space-y-3 py-4 text-center">
                  <p className="text-lg font-semibold text-ink">O que você quer saber?</p>
                  <p className="text-apoio text-ink-mute">Busco nas conversas, nos leads e nos links da sua empresa.</p>
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    {SUGESTOES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void pergunta(s)}
                        className="rounded-full border border-line px-3 py-1.5 text-apoio text-ink-mute hover:border-accent/40 hover:text-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {itens.map((it, i) => (
                <div key={i} className="space-y-3">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2 text-apoio text-white">
                    {it.pergunta}
                  </p>
                  {it.carregando ? (
                    <p className="flex items-center gap-2 text-apoio text-ink-mute">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Buscando…
                    </p>
                  ) : it.erro ? (
                    <p className="text-apoio text-red-600">{it.erro}</p>
                  ) : it.resposta ? (
                    <RespostaDaBusca r={it.resposta} fechar={() => setAberta(false)} />
                  ) : null}
                </div>
              ))}
              <div ref={fim} />
            </div>

            <form onSubmit={envia} className="border-t border-line p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-panel px-3 py-2 focus-within:border-accent/50">
                <textarea
                  ref={campo}
                  rows={1}
                  value={texto}
                  maxLength={300}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void pergunta(texto);
                    }
                  }}
                  placeholder="Ex.: quem pediu atendimento sobre gestante?"
                  className="max-h-32 flex-1 resize-none bg-transparent py-1 text-apoio text-ink outline-none placeholder:text-ink-mute"
                  aria-label="Sua pergunta"
                />
                <button
                  type="submit"
                  disabled={texto.trim().length < 2}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white transition disabled:opacity-30"
                  aria-label="Perguntar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RespostaDaBusca({ r, fechar }: { r: Resposta; fechar: () => void }) {
  return (
    <div className="space-y-3">
      {r.resposta ? (
        <p className="whitespace-pre-line text-apoio leading-relaxed text-ink">{r.resposta}</p>
      ) : (
        <p className="text-apoio text-ink">
          Nos últimos 7 dias chegaram <b>{r.numeros.leads7}</b> leads; em 30 dias, <b>{r.numeros.leads30}</b>
          {" "}({r.numeros.qualificados30} qualificados, {r.numeros.clientes30} clientes).
          {r.achados.length ? " Veja o que encontrei:" : " Não achei nada com esses termos."}
        </p>
      )}

      {r.achados.length ? (
        <ul className="space-y-1.5">
          {r.achados.slice(0, 10).map((a, i) => {
            const corpo = (
              <>
                <span className="flex items-center gap-2 text-rotulo text-ink-mute">
                  <span className="rounded bg-line/70 px-1.5">{ROTULO[a.tipo]}</span>
                  <span className="font-medium text-ink">{a.titulo}</span>
                  {a.quando ? <span>· {a.quando.split("-").reverse().join("/")}</span> : null}
                </span>
                <span className="mt-0.5 block text-apoio text-ink-mute">
                  <Destacado texto={a.trecho} />
                </span>
              </>
            );
            return (
              <li key={i}>
                {a.leadId ? (
                  <Link href={`/leads/${a.leadId}`} onClick={fechar} className="block rounded-xl border border-line px-3 py-2 hover:border-accent/40">
                    {corpo}
                  </Link>
                ) : (
                  <div className="rounded-xl border border-line px-3 py-2">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!r.iaLigada ? (
        <p className="text-rotulo text-ink-mute">
          Resposta escrita pela IA desligada. Para ligar de graça, coloque GEMINI_API_KEY na API.
        </p>
      ) : null}
    </div>
  );
}
