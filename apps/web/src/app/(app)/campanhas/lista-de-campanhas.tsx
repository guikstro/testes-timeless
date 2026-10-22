"use client";

import { useEffect, useState } from "react";

export type TomDaCampanha = "bom" | "atencao" | "ruim" | "neutro";

export interface LinhaDaLista {
  id: string;
  nome: string;
  /** A capa de um anúncio da campanha. O dono reconhece o anúncio pela imagem, não pelo nome. */
  imagemUrl?: string | null;
  /** Plataforma e situação, em uma linha curta. */
  detalhe: string;
  gastoCentavos: number;
  /** O resultado no trabalho da campanha; null quando a plataforma não mediu. */
  voltou: number | null;
  /** Como o resultado se lê: "pessoa"/"pessoas", "conversa"/"conversas". */
  unidade: [string, string];
  /** A frase que explica o resultado, mostrada no extrato. */
  frase: string;
  veredito: string | null;
  tom: TomDaCampanha;
}

export interface GrupoDaLista {
  chave: string;
  /** Sem título quando a tela só tem um trabalho. */
  titulo?: string;
  corDoTitulo?: string;
  linhas: LinhaDaLista[];
}

type Visao = "espelhado" | "extrato";
const CHAVE = "timeless:visao-de-campanhas";

/**
 * As campanhas, em duas formas de ler.
 *
 * Espelhado: o que saiu à esquerda, o que voltou à direita. A campanha que
 * gasta muito e traz pouco aparece de longe, porque as barras ficam desiguais.
 * Extrato: a mesma conta em linhas, como no extrato do banco, com a frase que
 * explica cada resultado. A escolha é de cada pessoa e fica neste navegador.
 *
 * As barras do que voltou usam o acento, que segue a cor da marca do cliente.
 */
export function ListaDeCampanhas({ grupos }: { grupos: GrupoDaLista[] }) {
  const [visao, setVisao] = useState<Visao>("espelhado");

  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CHAVE);
      if (guardada === "extrato" || guardada === "espelhado") setVisao(guardada);
    } catch {
      // Sem onde ler, fica o espelhado.
    }
  }, []);

  function escolhe(nova: Visao) {
    setVisao(nova);
    try {
      window.localStorage.setItem(CHAVE, nova);
    } catch {
      // Vale para esta visita.
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Cada campanha</h2>
        <div role="radiogroup" aria-label="Como ver as campanhas" className="inline-flex rounded-full border border-line bg-panel p-0.5">
          {(["espelhado", "extrato"] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={visao === opcao}
              onClick={() => escolhe(opcao)}
              className={`focus-ring rounded-full px-3.5 py-1.5 text-apoio font-medium transition-colors ${
                visao === opcao ? "bg-ink text-canvas" : "text-ink-soft hover:text-ink"
              }`}
            >
              {opcao === "espelhado" ? "Espelhado" : "Extrato"}
            </button>
          ))}
        </div>
      </div>

      {grupos.map((grupo) => (
        <div key={grupo.chave} className="mt-6">
          {grupo.titulo ? (
            <h3 className={`text-destaque font-semibold ${grupo.corDoTitulo ?? "text-ink"}`}>{grupo.titulo}</h3>
          ) : null}
          {visao === "espelhado" ? <Espelhado linhas={grupo.linhas} /> : <Extrato linhas={grupo.linhas} />}
          <Observacoes linhas={grupo.linhas} />
        </div>
      ))}
    </section>
  );
}

function Espelhado({ linhas }: { linhas: LinhaDaLista[] }) {
  const maiorGasto = Math.max(...linhas.map((l) => l.gastoCentavos), 1);
  const maiorVolta = Math.max(...linhas.map((l) => l.voltou ?? 0), 1);
  const comCapa = linhas.some((l) => l.imagemUrl);
  const colunas = "grid grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)] sm:gap-4";

  return (
    <div className="mt-2">
      <div className={`${colunas} pb-2 text-apoio text-ink-mute`}>
        <span className="text-right">o que saiu</span>
        <span className="text-center">campanha</span>
        <span>o que voltou</span>
      </div>
      <ul className="border-y border-line/70">
        {linhas.map((linha) => {
          const fraco = linha.tom === "atencao" || linha.tom === "ruim";
          return (
            <li key={linha.id} className={`${colunas} py-3`}>
              <div className="flex items-center justify-end gap-2">
                <span className="shrink-0 font-display text-corpo font-semibold tabular-nums text-ink">{reais(linha.gastoCentavos)}</span>
                <span
                  className="h-5 rounded-l-[3px] bg-ink-mute/45"
                  style={{ width: `${Math.max((linha.gastoCentavos / maiorGasto) * 100, 1.5)}%` }}
                />
              </div>
              <div className="flex min-w-0 items-center justify-center gap-2.5">
                {comCapa ? <Capa url={linha.imagemUrl} className="hidden h-9 w-9 sm:block" /> : null}
                <div className="min-w-0 text-center">
                  <p className="truncate text-apoio font-medium text-ink sm:text-corpo" title={linha.nome}>
                    {linha.nome}
                  </p>
                  <p className="truncate text-rotulo text-ink-mute">{linha.detalhe}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {linha.voltou !== null ? (
                  <>
                    <span
                      className={`h-5 rounded-r-[3px] ${fraco ? "bg-warning-line" : "bg-accent"}`}
                      style={{ width: `${Math.max((linha.voltou / maiorVolta) * 100, 1.5)}%` }}
                    />
                    <span className={`shrink-0 font-display text-corpo font-semibold tabular-nums ${fraco ? "text-warning" : "text-ink"}`}>
                      {inteiro(linha.voltou)}
                    </span>
                  </>
                ) : (
                  <span className="text-apoio text-ink-mute">sem medida</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-rotulo text-ink-mute">
        Barras do que voltou contam {linhas[0]?.unidade[1] ?? "resultados"}.
      </p>
    </div>
  );
}

function Extrato({ linhas }: { linhas: LinhaDaLista[] }) {
  const gasto = linhas.reduce((s, l) => s + l.gastoCentavos, 0);
  const voltou = linhas.reduce((s, l) => s + (l.voltou ?? 0), 0);
  const unidade = linhas[0]?.unidade ?? ["resultado", "resultados"];
  // Sem nenhuma capa (só Google, por exemplo), nada de quadrados vazios.
  const comCapa = linhas.some((l) => l.imagemUrl);

  return (
    <div className="mt-2">
      <div className="flex justify-between pb-2 text-apoio text-ink-mute">
        <span>campanha e investido</span>
        <span>o que voltou</span>
      </div>
      <ul className="border-t border-line/70">
        {linhas.map((linha) => (
          <li key={linha.id} className="flex gap-3.5 border-b border-line/70 py-3.5">
            {comCapa ? <Capa url={linha.imagemUrl} className="mt-0.5 h-12 w-12" /> : null}
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-corpo font-medium text-ink" title={linha.nome}>
                    {linha.nome}
                  </span>
                  <span className="min-w-6 flex-1 -translate-y-1 border-b-2 border-dotted border-line" aria-hidden />
                  <span className="shrink-0 font-display text-destaque font-semibold tabular-nums text-ink">{reais(linha.gastoCentavos)}</span>
                </div>
                <span className="w-28 text-right sm:w-40">
                  <span className={`font-display text-destaque font-semibold tabular-nums ${linha.tom === "atencao" || linha.tom === "ruim" ? "text-warning" : "text-accent"}`}>
                    {linha.voltou === null ? "–" : inteiro(linha.voltou)}
                  </span>{" "}
                  <span className="text-apoio text-ink-mute">{linha.voltou === 1 ? linha.unidade[0] : linha.unidade[1]}</span>
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-apoio leading-relaxed text-ink-mute">
                {linha.detalhe}. {linha.frase}
              </p>
            </div>
          </li>
        ))}
        <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t-2 border-ink py-3.5 ${comCapa ? "pl-[3.875rem]" : ""}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-corpo font-semibold text-ink">Total</span>
            <span className="font-display text-xl font-semibold tabular-nums text-ink">{reais(gasto)}</span>
          </div>
          <span className="w-28 text-right sm:w-40">
            <span className="font-display text-xl font-semibold tabular-nums text-accent">{inteiro(voltou)}</span>{" "}
            <span className="text-apoio text-ink-mute">{voltou === 1 ? unidade[0] : unidade[1]}</span>
          </span>
        </li>
      </ul>
    </div>
  );
}

/**
 * O que mais rende e o que menos rende, em frase.
 *
 * Só com três campanhas ou mais com resultado: com duas, "a melhor" e "a
 * pior" seriam só as duas que existem, e a frase não diria nada.
 */
function Observacoes({ linhas }: { linhas: LinhaDaLista[] }) {
  const comResultado = linhas.filter((l) => (l.voltou ?? 0) > 0 && l.gastoCentavos > 0);
  if (comResultado.length < 3) return null;

  const custo = (l: LinhaDaLista) => l.gastoCentavos / (l.voltou ?? 1);
  const ordenadas = [...comResultado].sort((a, b) => custo(a) - custo(b));
  const melhor = ordenadas[0];
  const pior = ordenadas[ordenadas.length - 1];
  const gastoTotal = linhas.reduce((s, l) => s + l.gastoCentavos, 0);
  const voltaTotal = linhas.reduce((s, l) => s + (l.voltou ?? 0), 0);
  const media = voltaTotal > 0 ? gastoTotal / voltaTotal : null;
  const unidade = melhor.unidade[0];

  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2">
      <div>
        <p className="font-display text-destaque font-semibold text-ink">A que mais rende</p>
        <p className="mt-1 text-corpo leading-relaxed text-ink-soft">
          {melhor.nome}: {porcento(melhor.gastoCentavos, gastoTotal)} do dinheiro e {porcento(melhor.voltou ?? 0, voltaTotal)} do
          resultado, a {centavos(custo(melhor))} por {unidade}.
        </p>
      </div>
      {media !== null && custo(pior) > media * 1.3 ? (
        <div>
          <p className="font-display text-destaque font-semibold text-warning">A que menos rende</p>
          <p className="mt-1 text-corpo leading-relaxed text-ink-soft">
            {pior.nome}: {centavos(custo(pior))} por {unidade}, {comparaComAMedia(custo(pior) / media)}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A capa do anúncio, num quadrado. Sem imagem, o quadrado fica vazio em vez
 * de sumir, para os nomes continuarem alinhados.
 */
function Capa({ url, className }: { url?: string | null; className: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (!url || quebrou) return <span aria-hidden className={`${className} shrink-0 rounded-lg bg-panel-soft`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- endereço assinado da Meta, que muda a cada sincronia
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setQuebrou(true)}
      className={`${className} shrink-0 rounded-lg border border-line/70 object-cover`}
    />
  );
}

function porcento(parte: number, todo: number): string {
  return todo > 0 ? `${Math.round((parte / todo) * 100)}%` : "0%";
}

function comparaComAMedia(razao: number): string {
  if (razao >= 2.5) return `${Math.round(razao)} vezes a média do mês`;
  if (razao >= 1.75) return "o dobro da média do mês";
  return `${Math.round((razao - 1) * 100)}% acima da média do mês`;
}

function inteiro(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function reais(c: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(c / 100);
}

/** Abaixo de R$ 1 os centavos importam. */
function centavos(c: number): string {
  return c < 100
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(c / 100)
    : reais(c);
}
