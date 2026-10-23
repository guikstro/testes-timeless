"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/dialog";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import {
  contagem,
  custo,
  inteiro,
  Objetivo,
  OBJETIVOS,
  reais,
  ROTULO_DO_OBJETIVO,
  Tom,
} from "@/lib/campanhas/resultado";
import type { LinhaDeCampanha } from "./linhas-por-resultado";
import { DetalheDaCampanha } from "./detalhe-da-campanha";
import { NomeDoCanal, Previa } from "./previa-do-anuncio";
import { ValorDoResultado } from "./valor-do-resultado";

/**
 * Campanhas por resultado: o que foi investido, o que aconteceu e qual
 * campanha merece atenção.
 *
 * Agrupada pelo objetivo, porque cada objetivo tem a própria unidade:
 * venda, pedido de rota e visualização nunca se somam num "resultados"
 * genérico. Dentro do grupo, quem pede atenção vem primeiro, e depois o
 * maior investimento.
 */
export function CampanhasPorResultado({
  linhas,
  objetivoInicial,
  medido,
  rotuloDoPeriodo,
  rotuloDaComparacao,
}: {
  linhas: LinhaDeCampanha[];
  objetivoInicial: Objetivo | null;
  medido: boolean;
  rotuloDoPeriodo: string;
  /** O período com que o detalhe compara; null quando não há. */
  rotuloDaComparacao: string | null;
}) {
  const [objetivo, setObjetivo] = useState<Objetivo | null>(objetivoInicial);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const escolhe = (novo: Objetivo | null) => {
    setObjetivo(novo);
    // No endereço, para o filtro sobreviver a recarregar e a trocar de mês.
    try {
      const url = new URL(window.location.href);
      if (novo) url.searchParams.set("objetivo", novo);
      else url.searchParams.delete("objetivo");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Sem histórico (raro): o filtro só não fica no endereço.
    }
  };

  const presentes = OBJETIVOS.filter((o) => linhas.some((l) => l.objetivo === o));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = linhas.filter(
    (l) => (!objetivo || l.objetivo === objetivo) && (!termo || l.nome.toLocaleLowerCase("pt-BR").includes(termo)),
  );
  const grupos = useMemo(
    () =>
      OBJETIVOS.map((o) => ({
        objetivo: o,
        linhas: visiveis
          .filter((l) => l.objetivo === o)
          .sort((a, b) => b.resultado.atencao - a.resultado.atencao || b.gastoCentavos - a.gastoCentavos),
      })).filter((g) => g.linhas.length > 0),
    [visiveis],
  );
  const selecionada = linhas.find((l) => l.id === aberta) ?? null;

  if (linhas.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-panel px-6 py-12 text-center text-destaque text-ink-mute">
        Nenhuma campanha com gasto em {rotuloDoPeriodo}.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Só os objetivos que existem no período: um filtro que sempre esvazia a lista é ruído. */}
        {presentes.length > 1 ? (
          <GrupoDePilulas
            ativo={objetivo ?? "todos"}
            opcoes={[
              { chave: "todos", rotulo: "Todos os objetivos", aoClicar: () => escolhe(null) },
              ...presentes.map((o) => ({ chave: o, rotulo: ROTULO_DO_OBJETIVO[o], aoClicar: () => escolhe(o) })),
            ]}
          />
        ) : (
          <span />
        )}
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Buscar campanha</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="busca-de-campanha"
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar campanha"
            className="focus-ring h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-corpo text-ink placeholder:text-ink-mute"
          />
        </label>
      </div>

      {objetivo ? <ResumoDoObjetivo objetivo={objetivo} linhas={visiveis} medido={medido} /> : null}

      {grupos.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-panel px-6 py-10 text-center text-corpo text-ink-mute">
          {termo ? "Nenhuma campanha com esse nome." : `Nenhuma campanha de ${ROTULO_DO_OBJETIVO[objetivo!].toLowerCase()} neste período.`}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.7fr)] border-b border-line px-4 py-2.5 text-apoio font-medium text-ink-mute md:grid">
            <span>Campanha</span>
            <span>Canal</span>
            <span>Investimento</span>
            <span>Resultado</span>
          </div>
          {grupos.map((grupo) => (
            <section key={grupo.objetivo} aria-label={ROTULO_DO_OBJETIVO[grupo.objetivo]}>
              {!objetivo ? <CabecalhoDoGrupo objetivo={grupo.objetivo} linhas={grupo.linhas} medido={medido} /> : null}
              <ul>
                {grupo.linhas.map((linha) => (
                  <li key={linha.id} className="border-b border-line last:border-b-0">
                    <Linha linha={linha} ativa={aberta === linha.id} aoAbrir={() => setAberta(linha.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-3 text-apoio text-ink-mute">
        Cada objetivo tem a própria unidade de resultado. Compare campanhas do mesmo objetivo.
      </p>

      <Drawer
        aberto={selecionada !== null}
        aoFechar={() => setAberta(null)}
        titulo={selecionada?.nome ?? ""}
        descricao={selecionada ? `Objetivo: ${ROTULO_DO_OBJETIVO[selecionada.objetivo].toLowerCase()}` : undefined}
        className="sm:max-w-lg"
      >
        {selecionada ? <DetalheDaCampanha linha={selecionada} medido={medido} rotuloDoPeriodo={rotuloDoPeriodo} rotuloDaComparacao={rotuloDaComparacao} /> : null}
      </Drawer>
    </div>
  );
}

const TOM: Record<Tom, string> = {
  bom: "bg-success-soft text-success",
  atencao: "bg-warning-soft text-warning",
  ruim: "bg-danger-soft text-danger",
  neutro: "bg-panel-soft text-ink-soft",
};

function Linha({ linha, ativa, aoAbrir }: { linha: LinhaDeCampanha; ativa: boolean; aoAbrir: () => void }) {
  const { resultado } = linha;
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-haspopup="dialog"
      className={`focus-ring relative grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-panel-soft/60 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.7fr)] md:items-center md:gap-4 ${
        ativa ? "bg-panel-soft/60" : ""
      }`}
    >
      {/* A barra da linha aberta, como na lista de mensagens: diz qual está na gaveta. */}
      {ativa ? <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" aria-hidden /> : null}
      <span className="row-span-2 flex min-w-0 items-center gap-3.5 md:row-span-1">
        <Previa linha={linha} className="w-[5.5rem] shrink-0 md:w-24" />
        <span className="hidden min-w-0 md:block">
          <NomeEFormato linha={linha} />
        </span>
      </span>
      <span className="min-w-0 md:hidden">
        <NomeEFormato linha={linha} />
      </span>

      <span className="hidden md:flex">
        <NomeDoCanal plataforma={linha.plataforma} />
      </span>

      <span className="flex items-baseline gap-3 md:block">
        <span className="font-display text-destaque font-semibold tabular-nums text-ink">{reais(linha.gastoCentavos)}</span>
        <span className="text-apoio text-ink-mute md:hidden">investidos</span>
      </span>

      <span className="col-start-2 min-w-0 md:col-start-auto">
        <ValorDoResultado resultado={resultado} />
        {resultado.conclusao ? (
          <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-apoio font-medium ${TOM[resultado.conclusao.tom]}`}>
            {resultado.conclusao.texto}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function NomeEFormato({ linha }: { linha: LinhaDeCampanha }) {
  return (
    <>
      <span className="block truncate text-corpo font-semibold text-ink" title={linha.nome}>
        {linha.nome}
      </span>
      <span className="block truncate text-apoio text-ink-mute">{linha.formato}</span>
    </>
  );
}

/** A faixa do grupo: o que o grupo investiu e o que ele trouxe, na unidade dele. */
function CabecalhoDoGrupo({ objetivo, linhas, medido }: { objetivo: Objetivo; linhas: LinhaDeCampanha[]; medido: boolean }) {
  const gasto = linhas.reduce((s, l) => s + l.gastoCentavos, 0);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line bg-panel-soft px-4 py-2">
      <h3 className="text-corpo font-semibold text-ink">{ROTULO_DO_OBJETIVO[objetivo]}</h3>
      <p className="text-apoio text-ink-soft">
        {reais(gasto)} investidos{resumoDoGrupo(objetivo, linhas, medido)}
      </p>
    </div>
  );
}

function resumoDoGrupo(objetivo: Objetivo, linhas: LinhaDeCampanha[], medido: boolean): string {
  const soma = (f: (l: LinhaDeCampanha) => number | null) => linhas.reduce((s, l) => s + (f(l) ?? 0), 0);
  if (objetivo === "audiencia") {
    const views = soma((l) => l.numeros.visualizacoesDeVideo);
    return views > 0 ? `, ${contagem(views, "visualização", "visualizações")}` : "";
  }
  if (objetivo === "local") {
    const rotas = soma((l) => l.loja?.rotas ?? null);
    const ligacoes = soma((l) => l.loja?.ligacoes ?? null);
    return `, ${contagem(rotas, "pedido de rota", "pedidos de rota")} e ${contagem(ligacoes, "clique para ligar", "cliques para ligar")}`;
  }
  if (!medido) return "";
  const vendas = soma((l) => l.numeros.vendas);
  const contatos = soma((l) => l.numeros.leads);
  return `, ${contagem(contatos, "contato", "contatos")} e ${contagem(vendas, "venda confirmada", "vendas confirmadas")}`;
}

/** Com um objetivo escolhido, os números que importam para ele, e só eles. */
function ResumoDoObjetivo({ objetivo, linhas, medido }: { objetivo: Objetivo; linhas: LinhaDeCampanha[]; medido: boolean }) {
  const soma = (f: (l: LinhaDeCampanha) => number | null) => linhas.reduce((s, l) => s + (f(l) ?? 0), 0);
  const gasto = soma((l) => l.gastoCentavos);
  const itens: { rotulo: string; valor: string }[] = [{ rotulo: "Investido", valor: reais(gasto) }];
  if (objetivo === "vendas") {
    if (medido) {
      const vendas = soma((l) => l.numeros.vendas);
      const receita = soma((l) => l.numeros.receitaCentavos);
      itens.push(
        { rotulo: "Contatos", valor: inteiro(soma((l) => l.numeros.leads)) },
        { rotulo: "Vendas confirmadas", valor: inteiro(vendas) },
        { rotulo: "Receita atribuída", valor: receita > 0 ? reais(receita) : "Sem valor informado" },
      );
      if (vendas > 0 && gasto > 0) itens.push({ rotulo: "Custo por venda", valor: custo(gasto / vendas) });
    } else {
      itens.push({ rotulo: "Conversas abertas", valor: inteiro(soma((l) => l.numeros.conversasNaPlataforma)) });
    }
  } else if (objetivo === "local") {
    itens.push(
      { rotulo: "Pedidos de rota", valor: inteiro(soma((l) => l.loja?.rotas ?? null)) },
      { rotulo: "Cliques para ligar", valor: inteiro(soma((l) => l.loja?.ligacoes ?? null)) },
    );
  } else {
    itens.push(
      { rotulo: "Visualizações", valor: inteiro(soma((l) => l.numeros.visualizacoesDeVideo)) },
      { rotulo: "Exibições", valor: inteiro(soma((l) => l.numeros.impressoes)) },
    );
  }
  return (
    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-line bg-panel px-5 py-4">
      {itens.map((item) => (
        <div key={item.rotulo}>
          <dt className="text-apoio text-ink-mute">{item.rotulo}</dt>
          <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink">{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
