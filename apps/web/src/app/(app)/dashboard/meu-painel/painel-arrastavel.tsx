"use client";

import { useEffect, useRef, useState } from "react";
import { StatCard } from "../stat-card";
import { Overview } from "../tipos";

export type TipoDeBloco =
  | "numero-leads"
  | "numero-qualificados"
  | "numero-clientes"
  | "numero-faturamento"
  | "grafico-diario"
  | "origens"
  | "links"
  | "teste-ab"
  | "atendimento";

export interface Bloco {
  id: string;
  tipo: TipoDeBloco;
  largura: 1 | 2 | 3;
  linkA?: string;
  linkB?: string;
}

export interface LinkDoPainel {
  id: string;
  name: string;
  code: string;
  _count: { clicks: number };
  leads?: number;
}

/** O catálogo da direita: o que dá para arrastar para o painel. */
export const CATALOGO: { tipo: TipoDeBloco; rotulo: string; descricao: string; largura: 1 | 2 | 3 }[] = [
  { tipo: "numero-leads", rotulo: "Leads", descricao: "Quantos chegaram no período", largura: 1 },
  { tipo: "numero-qualificados", rotulo: "Qualificados", descricao: "Leads que valem conversa", largura: 1 },
  { tipo: "numero-clientes", rotulo: "Clientes", descricao: "Reunião marcada ou venda", largura: 1 },
  { tipo: "numero-faturamento", rotulo: "Faturamento", descricao: "Vendas registradas", largura: 1 },
  { tipo: "grafico-diario", rotulo: "Leads por dia", descricao: "A curva do período", largura: 3 },
  { tipo: "origens", rotulo: "Origens", descricao: "De onde vieram os leads", largura: 2 },
  { tipo: "links", rotulo: "Links rastreáveis", descricao: "Cliques e leads por link", largura: 2 },
  { tipo: "teste-ab", rotulo: "Teste A/B", descricao: "Compare dois links lado a lado", largura: 2 },
  { tipo: "atendimento", rotulo: "Atendimento", descricao: "Respondidos e esperando", largura: 1 },
];

const LARGURA: Record<1 | 2 | 3, string> = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3" };

let contador = 0;
const novoId = () => `b${Date.now().toString(36)}${(contador++).toString(36)}`;

/** Move o item de `de` para `para` (índices), devolvendo uma lista nova. */
export function move<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || de >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(Math.max(0, Math.min(para, copia.length)), 0, item);
  return copia;
}

type Arrastando = { origem: "catalogo"; tipo: TipoDeBloco } | { origem: "painel"; indice: number } | null;

export function PainelArrastavel({
  inicial,
  overview,
  links,
}: {
  inicial: Bloco[];
  overview: Overview;
  links: LinkDoPainel[];
}) {
  const [blocos, setBlocos] = useState<Bloco[]>(inicial);
  const [arrastando, setArrastando] = useState<Arrastando>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [estado, setEstado] = useState<"salvo" | "salvando" | "erro">("salvo");
  const primeira = useRef(true);

  // Salva sozinho, meio segundo depois da última mudança.
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    setEstado("salvando");
    const t = setTimeout(() => {
      fetch("/api/assistente/painel", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocos }),
      })
        .then((r) => setEstado(r.ok ? "salvo" : "erro"))
        .catch(() => setEstado("erro"));
    }, 500);
    return () => clearTimeout(t);
  }, [blocos]);

  const adiciona = (tipo: TipoDeBloco, posicao = blocos.length) => {
    const modelo = CATALOGO.find((c) => c.tipo === tipo)!;
    const bloco: Bloco = { id: novoId(), tipo, largura: modelo.largura };
    if (tipo === "teste-ab") {
      bloco.linkA = links[0]?.id;
      bloco.linkB = links[1]?.id;
    }
    setBlocos((atual) => {
      const copia = [...atual];
      copia.splice(posicao, 0, bloco);
      return copia;
    });
  };
  const altera = (id: string, mudanca: Partial<Bloco>) =>
    setBlocos((atual) => atual.map((b) => (b.id === id ? { ...b, ...mudanca } : b)));
  const remove = (id: string) => setBlocos((atual) => atual.filter((b) => b.id !== id));

  const solta = (posicao: number) => {
    if (arrastando?.origem === "catalogo") adiciona(arrastando.tipo, posicao);
    if (arrastando?.origem === "painel") {
      setBlocos((atual) => move(atual, arrastando.indice, posicao > arrastando.indice ? posicao - 1 : posicao));
    }
    setArrastando(null);
    setAlvo(null);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
      <section
        aria-label="Seu painel"
        className={`grid min-h-[320px] content-start gap-4 rounded-3xl border-2 border-dashed p-3 transition-colors md:grid-cols-3 ${
          arrastando ? "border-accent/50 bg-accent/5" : "border-transparent"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (alvo === null) setAlvo(blocos.length);
        }}
        onDrop={(e) => {
          e.preventDefault();
          solta(alvo ?? blocos.length);
        }}
      >
        {blocos.length === 0 ? (
          <p className="col-span-full grid h-64 place-items-center text-apoio text-ink-mute">
            Painel vazio. Arraste um bloco da direita para cá.
          </p>
        ) : null}
        {blocos.map((bloco, i) => (
          <div
            key={bloco.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setArrastando({ origem: "painel", indice: i });
            }}
            onDragEnd={() => {
              setArrastando(null);
              setAlvo(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setAlvo(e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              solta(alvo ?? i);
            }}
            className={`group relative col-span-1 cursor-grab active:cursor-grabbing ${LARGURA[bloco.largura]} ${
              arrastando?.origem === "painel" && arrastando.indice === i ? "opacity-40" : ""
            }`}
          >
            {alvo === i && arrastando ? <Marcador lado="esquerda" /> : null}
            {alvo === i + 1 && arrastando && i === blocos.length - 1 ? <Marcador lado="direita" /> : null}
            <Controles
              bloco={bloco}
              primeiro={i === 0}
              ultimo={i === blocos.length - 1}
              onLargura={(largura) => altera(bloco.id, { largura })}
              onMover={(d) => setBlocos((atual) => move(atual, i, i + d))}
              onRemover={() => remove(bloco.id)}
            />
            <ConteudoDoBloco bloco={bloco} overview={overview} links={links} onAltera={(m) => altera(bloco.id, m)} />
          </div>
        ))}
      </section>

      <aside className="space-y-2 lg:sticky lg:top-16 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="text-apoio font-semibold text-ink">Blocos</h2>
          <span className="text-rotulo text-ink-mute" aria-live="polite">
            {estado === "salvando" ? "Salvando…" : estado === "erro" ? "Não salvou" : "Salvo"}
          </span>
        </div>
        {CATALOGO.map((item) => (
          <div
            key={item.tipo}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              setArrastando({ origem: "catalogo", tipo: item.tipo });
            }}
            onDragEnd={() => {
              setArrastando(null);
              setAlvo(null);
            }}
            className="flex cursor-grab items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 shadow-subtle transition hover:border-accent/40 active:cursor-grabbing"
          >
            <span aria-hidden className="text-ink-mute">⠿</span>
            <div className="min-w-0 flex-1">
              <p className="text-apoio font-medium text-ink">{item.rotulo}</p>
              <p className="truncate text-rotulo text-ink-mute">{item.descricao}</p>
            </div>
            {/* Para quem está no celular ou no teclado: sem arrastar. */}
            <button
              type="button"
              onClick={() => adiciona(item.tipo)}
              className="rounded-lg px-2 text-lg leading-none text-ink-mute hover:bg-accent/10 hover:text-accent"
              aria-label={`Adicionar ${item.rotulo}`}
            >
              +
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setBlocos([])}
          className="w-full rounded-xl px-3 py-2 text-rotulo text-ink-mute hover:text-ink"
        >
          Limpar painel
        </button>
      </aside>
    </div>
  );
}

function Marcador({ lado }: { lado: "esquerda" | "direita" }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-y-0 z-10 w-1 rounded-full bg-accent ${lado === "esquerda" ? "-left-2.5" : "-right-2.5"}`}
    />
  );
}

function Controles({
  bloco,
  primeiro,
  ultimo,
  onLargura,
  onMover,
  onRemover,
}: {
  bloco: Bloco;
  primeiro: boolean;
  ultimo: boolean;
  onLargura: (l: 1 | 2 | 3) => void;
  onMover: (d: number) => void;
  onRemover: () => void;
}) {
  const botao = "grid h-6 min-w-6 place-items-center rounded-md px-1 text-rotulo text-ink-mute hover:bg-accent/10 hover:text-accent";
  return (
    <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-panel/95 p-0.5 opacity-0 shadow-subtle transition group-focus-within:opacity-100 group-hover:opacity-100">
      <button type="button" className={botao} disabled={primeiro} onClick={() => onMover(-1)} aria-label="Mover para antes">←</button>
      <button type="button" className={botao} disabled={ultimo} onClick={() => onMover(1)} aria-label="Mover para depois">→</button>
      {([1, 2, 3] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={`${botao} ${bloco.largura === l ? "text-accent" : ""}`}
          onClick={() => onLargura(l)}
          aria-label={`Largura ${l} de 3`}
          aria-pressed={bloco.largura === l}
        >
          {l}/3
        </button>
      ))}
      <button type="button" className={botao} onClick={onRemover} aria-label="Tirar do painel">✕</button>
    </div>
  );
}

function Caixa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-line bg-panel p-4 shadow-subtle">
      <p className="mb-3 text-apoio font-medium text-ink-mute">{titulo}</p>
      {children}
    </div>
  );
}

function ConteudoDoBloco({
  bloco,
  overview,
  links,
  onAltera,
}: {
  bloco: Bloco;
  overview: Overview;
  links: LinkDoPainel[];
  onAltera: (m: Partial<Bloco>) => void;
}) {
  const t = overview.totals;
  const c = overview.comparacao;
  const serie = overview.daily.map((p) => p.leads);
  switch (bloco.tipo) {
    case "numero-leads":
      return <StatCard rotulo="Leads" numero={t.leads} delta={c.leads.delta} anterior={c.leads.anterior} serie={serie} />;
    case "numero-qualificados":
      return <StatCard rotulo="Qualificados" numero={t.qualified} delta={c.qualified.delta} anterior={c.qualified.anterior} />;
    case "numero-clientes":
      return <StatCard rotulo="Clientes" numero={t.clientes} delta={c.clientes.delta} anterior={c.clientes.anterior} serie={overview.daily.map((p) => p.won)} />;
    case "numero-faturamento":
      return <StatCard rotulo="Faturamento" numero={t.revenueCents / 100} formato="moeda" delta={c.revenueCents.delta} anterior={c.revenueCents.anterior / 100} />;
    case "grafico-diario":
      return (
        <Caixa titulo="Leads por dia">
          <Barras pontos={overview.daily.map((p) => ({ rotulo: p.date.slice(5).split("-").reverse().join("/"), valor: p.leads }))} />
        </Caixa>
      );
    case "origens":
      return (
        <Caixa titulo="Origens">
          <Linhas linhas={overview.byOrigin.map((o) => ({ nome: o.label, valor: o.leads, extra: `${o.clientes} clientes` }))} />
        </Caixa>
      );
    case "links":
      return (
        <Caixa titulo="Links rastreáveis">
          <Linhas linhas={links.map((l) => ({ nome: l.name, valor: l._count.clicks, extra: `${l.leads ?? 0} leads`, unidade: "cliques" }))} />
        </Caixa>
      );
    case "atendimento":
      return (
        <Caixa titulo="Atendimento">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Numero rotulo="Respondidos" valor={overview.atendimento.respondidos} />
            <Numero rotulo="Sem resposta" valor={overview.atendimento.semResposta} />
            <Numero rotulo="Esperando" valor={overview.atendimento.aguardando} />
          </dl>
        </Caixa>
      );
    case "teste-ab":
      return <TesteAB bloco={bloco} links={links} onAltera={onAltera} />;
  }
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dd className="text-xl font-semibold tabular-nums text-ink">{valor}</dd>
      <dt className="text-rotulo text-ink-mute">{rotulo}</dt>
    </div>
  );
}

function Barras({ pontos }: { pontos: { rotulo: string; valor: number }[] }) {
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  return (
    <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Leads por dia">
      {pontos.map((p) => (
        <div key={p.rotulo} className="group/b relative flex-1" style={{ height: "100%" }}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t bg-accent/70 transition group-hover/b:bg-accent"
            style={{ height: `${Math.max(2, (p.valor / max) * 100)}%` }}
          />
          <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-rotulo text-canvas group-hover/b:block">
            {p.rotulo}: {p.valor}
          </span>
        </div>
      ))}
    </div>
  );
}

function Linhas({ linhas }: { linhas: { nome: string; valor: number; extra?: string; unidade?: string }[] }) {
  if (linhas.length === 0) return <p className="text-apoio text-ink-mute">Nada no período.</p>;
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <ul className="space-y-2">
      {linhas.slice(0, 8).map((l) => (
        <li key={l.nome}>
          <div className="flex justify-between gap-3 text-apoio">
            <span className="truncate text-ink">{l.nome}</span>
            <span className="shrink-0 tabular-nums text-ink-mute">
              {l.valor}
              {l.unidade ? ` ${l.unidade}` : ""}
              {l.extra ? ` · ${l.extra}` : ""}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-line/60">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${(l.valor / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Taxa de lead por clique de cada link, e qual está ganhando. */
export function comparaAB(a?: LinkDoPainel, b?: LinkDoPainel) {
  const taxa = (l?: LinkDoPainel) => (l && l._count.clicks > 0 ? (l.leads ?? 0) / l._count.clicks : null);
  const ta = taxa(a);
  const tb = taxa(b);
  const vencedor = ta === null || tb === null || ta === tb ? null : ta > tb ? "A" : "B";
  return { ta, tb, vencedor } as const;
}

function TesteAB({ bloco, links, onAltera }: { bloco: Bloco; links: LinkDoPainel[]; onAltera: (m: Partial<Bloco>) => void }) {
  const a = links.find((l) => l.id === bloco.linkA);
  const b = links.find((l) => l.id === bloco.linkB);
  const { ta, tb, vencedor } = comparaAB(a, b);
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  const lado = (letra: "A" | "B", link: LinkDoPainel | undefined, taxa: number | null, campo: "linkA" | "linkB") => (
    <div className={`rounded-xl border p-3 ${vencedor === letra ? "border-accent bg-accent/5" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-rotulo font-semibold text-canvas">{letra}</span>
        <select
          value={link?.id ?? ""}
          onChange={(e) => onAltera({ [campo]: e.target.value || undefined })}
          className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 py-1 text-apoio text-ink"
          aria-label={`Link ${letra}`}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        >
          <option value="">Escolha um link</option>
          {links.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">{pct(taxa)}</p>
      <p className="text-rotulo text-ink-mute">
        {link ? `${link.leads ?? 0} leads de ${link._count.clicks} cliques` : "lead por clique"}
        {vencedor === letra ? " · ganhando" : ""}
      </p>
    </div>
  );
  return (
    <Caixa titulo="Teste A/B">
      {links.length < 2 ? (
        <p className="text-apoio text-ink-mute">Crie pelo menos dois links rastreáveis para comparar.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lado("A", a, ta, "linkA")}
          {lado("B", b, tb, "linkB")}
        </div>
      )}
    </Caixa>
  );
}
