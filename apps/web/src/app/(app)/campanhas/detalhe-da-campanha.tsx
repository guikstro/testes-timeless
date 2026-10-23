"use client";

import Link from "next/link";
import { contagem, custo, inteiro, reais, ROTULO_DO_OBJETIVO } from "@/lib/campanhas/resultado";
import type { LinhaDeCampanha } from "./linhas-por-resultado";
import { NomeDoCanal, Previa } from "./previa-do-anuncio";
import { ValorDoResultado } from "./valor-do-resultado";

/**
 * O detalhe da campanha, na gaveta.
 *
 * O caminho mostrado muda com o objetivo: uma campanha de audiência não tem
 * venda no fim, e uma de presença local termina na visita, que ninguém mede.
 * Cada parte só aparece quando há dado para ela.
 */
export function DetalheDaCampanha({
  linha,
  medido,
  rotuloDoPeriodo,
  rotuloDaComparacao,
  perfilDoNegocio = null,
}: {
  linha: LinhaDeCampanha;
  medido: boolean;
  rotuloDoPeriodo: string;
  rotuloDaComparacao: string | null;
  perfilDoNegocio?: string | null;
}) {
  // No meio da frase: "investidos em outubro de 2026".
  const periodo = rotuloDoPeriodo.replace(/^./, (c) => c.toLowerCase());
  return (
    <div className="space-y-6 pb-6">
      {/* A capa grande só quando existe: sem imagem, um quadro vazio desse tamanho não diz nada. */}
      {linha.imagemUrl ? <Previa linha={linha} className="w-full" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NomeDoCanal plataforma={linha.plataforma} />
        <span className="text-apoio text-ink-mute">{linha.formato}</span>
      </div>

      <Secao titulo="Resultado rastreado">
        <Caminho linha={linha} medido={medido} />
        <div className="mt-4">
          <ValorDoResultado resultado={linha.resultado} />
        </div>
        <p className="mt-2 text-apoio text-ink-mute">
          {reais(linha.gastoCentavos)} investidos em {periodo}.
        </p>
      </Secao>

      {rotuloDaComparacao ? (
        <Secao titulo={`Comparado com ${rotuloDaComparacao}`}>
          {linha.anterior ? (
            <dl className="grid grid-cols-2 gap-4">
              <Comparado rotulo="Investimento" agora={reais(linha.gastoCentavos)} antes={reais(linha.anterior.gastoCentavos)} />
              <Comparado
                rotulo={linha.resultado.unidade[1].replace(/^./, (c) => c.toUpperCase())}
                agora={linha.resultado.valor === null ? "Sem medida" : inteiro(linha.resultado.valor)}
                antes={
                  linha.anterior.resultado.valor === null
                    ? "Sem medida"
                    : linha.anterior.resultado.unidade[1] === linha.resultado.unidade[1]
                      ? inteiro(linha.anterior.resultado.valor)
                      : contagem(linha.anterior.resultado.valor, ...linha.anterior.resultado.unidade)
                }
              />
            </dl>
          ) : (
            <p className="text-corpo text-ink-soft">A campanha não teve gasto nesse período.</p>
          )}
        </Secao>
      ) : null}

      {linha.porDia.length > 1 ? (
        <Secao titulo="Investimento por dia">
          <Evolucao linha={linha} medido={medido} />
        </Secao>
      ) : null}

      {linha.anuncios.length ? (
        <Secao titulo={linha.anuncios.length === 1 ? "Anúncio" : `${linha.anuncios.length} anúncios`}>
          <ul className="divide-y divide-line">
            {linha.anuncios.map((anuncio) => (
              <li key={anuncio.externalId} className="flex items-center gap-3 py-2.5">
                <Previa
                  linha={{ imagemUrl: anuncio.imagemUrl, plataforma: linha.plataforma, formato: "Anúncio", nome: anuncio.name }}
                  className="w-14 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-corpo font-medium text-ink" title={anuncio.name}>
                    {anuncio.name}
                  </p>
                  <p className="text-apoio text-ink-mute">
                    {reais(anuncio.gastoCentavos)}
                    {medido && linha.objetivo === "vendas"
                      ? `, ${contagem(anuncio.leads, "contato", "contatos")}${anuncio.vendas ? `, ${contagem(anuncio.vendas, "venda", "vendas")}` : ""}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      {medido && linha.objetivo === "vendas" && linha.numeros.leads > 0 ? (
        <Secao titulo="Contatos e vendas">
          <p className="text-corpo text-ink-soft">
            {contagem(linha.numeros.leads, "contato chegou", "contatos chegaram")} por esta campanha,{" "}
            {contagem(linha.numeros.vendas, "virou venda confirmada", "viraram venda confirmada")}.
          </p>
          <Link
            href={`/dashboard?aba=funil&days=30&campanha=${encodeURIComponent(linha.id)}`}
            className="focus-ring mt-3 inline-flex rounded-lg bg-ink px-4 py-2 text-corpo font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Ver contatos e evidências
          </Link>
        </Secao>
      ) : null}

      <AnaliseDaIa linha={linha} rotuloDoPeriodo={periodo} perfilDoNegocio={perfilDoNegocio} />
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line px-4 py-4">
      <h3 className="mb-3 text-corpo font-semibold text-ink">{titulo}</h3>
      {children}
    </section>
  );
}

function Comparado({ rotulo, agora, antes }: { rotulo: string; agora: string; antes: string }) {
  return (
    <div>
      <dt className="text-apoio text-ink-mute">{rotulo}</dt>
      <dd className="mt-0.5 font-display text-destaque font-semibold tabular-nums text-ink">{agora}</dd>
      <dd className="text-apoio text-ink-mute">antes: {antes}</dd>
    </div>
  );
}

/** Os passos do anúncio até o resultado, na ordem do objetivo. */
function Caminho({ linha, medido }: { linha: LinhaDeCampanha; medido: boolean }) {
  const n = linha.numeros;
  const passos: { rotulo: string; valor: string | null; feito: boolean }[] =
    linha.objetivo === "audiencia"
      ? [
          { rotulo: "Exibição", valor: n.impressoes === null ? null : inteiro(n.impressoes), feito: (n.impressoes ?? 0) > 0 },
          {
            rotulo: "Visualização",
            valor: n.visualizacoesDeVideo === null ? null : inteiro(n.visualizacoesDeVideo),
            feito: (n.visualizacoesDeVideo ?? 0) > 0,
          },
        ]
      : linha.objetivo === "local"
        ? [
            { rotulo: "Exibição", valor: n.impressoes === null ? null : inteiro(n.impressoes), feito: (n.impressoes ?? 0) > 0 },
            {
              // Rota e ligação lado a lado, nunca somadas: são ações diferentes.
              rotulo: "Rota ou ligação",
              valor: linha.loja
                ? `${inteiro(linha.loja.rotas ?? 0)} rotas, ${inteiro(linha.loja.ligacoes ?? 0)} ligações`
                : null,
              feito: (linha.loja?.ligacoes ?? 0) > 0 || (linha.loja?.rotas ?? 0) > 0,
            },
            { rotulo: "Visita", valor: "não medida", feito: false },
          ]
        : medido
          ? [
              { rotulo: "Anúncio", valor: n.cliques === null ? null : `${inteiro(n.cliques)} cliques`, feito: n.gastoCentavos > 0 },
              { rotulo: "Contato", valor: inteiro(n.leads), feito: n.leads > 0 },
              { rotulo: "Venda", valor: inteiro(n.vendas), feito: n.vendas > 0 },
            ]
          : [
              { rotulo: "Anúncio", valor: n.cliques === null ? null : `${inteiro(n.cliques)} cliques`, feito: n.gastoCentavos > 0 },
              {
                rotulo: "Conversa",
                valor: n.conversasNaPlataforma === null ? null : inteiro(n.conversasNaPlataforma),
                feito: (n.conversasNaPlataforma ?? 0) > 0,
              },
            ];

  return (
    <ol className="flex items-start" aria-label={`Caminho de ${ROTULO_DO_OBJETIVO[linha.objetivo].toLowerCase()}`}>
      {passos.map((passo, i) => (
        <li key={passo.rotulo} className="relative flex flex-1 flex-col items-center text-center">
          {i > 0 ? <span className="absolute right-1/2 top-3 h-px w-full bg-line" aria-hidden /> : null}
          <span
            className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border ${
              passo.feito ? "border-ink bg-ink text-canvas" : "border-line bg-panel text-ink-mute"
            }`}
          >
            {passo.feito ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="m5 12 5 5 9-10" />
              </svg>
            ) : null}
          </span>
          <span className="mt-1.5 text-apoio font-medium text-ink-soft">{passo.rotulo}</span>
          <span className="text-apoio tabular-nums text-ink-mute">{passo.valor ?? "sem medida"}</span>
        </li>
      ))}
    </ol>
  );
}

/** Barras do gasto por dia; em vendas, quantos contatos chegaram em cada dia. */
function Evolucao({ linha, medido }: { linha: LinhaDeCampanha; medido: boolean }) {
  const dias = linha.porDia;
  const maior = Math.max(...dias.map((d) => d.gastoCentavos), 1);
  const comContatos = medido && linha.objetivo === "vendas";
  const primeiro = dias[0].dia;
  const ultimo = dias[dias.length - 1].dia;
  const totalDeContatos = dias.reduce((s, d) => s + d.leads, 0);
  return (
    <figure>
      <div
        className="flex h-24 items-end gap-[2px]"
        role="img"
        aria-label={`Investimento em ${dias.length} dias, de ${diaCurto(primeiro)} a ${diaCurto(ultimo)}, maior dia ${reais(maior)}`}
      >
        {dias.map((d) => (
          <span
            key={d.dia}
            title={`${diaCurto(d.dia)}: ${reais(d.gastoCentavos)}${comContatos ? `, ${contagem(d.leads, "contato", "contatos")}` : ""}`}
            className="min-w-[2px] flex-1 rounded-t-[2px] bg-ink-mute/45"
            style={{ height: `${Math.max((d.gastoCentavos / maior) * 100, d.gastoCentavos > 0 ? 3 : 0)}%` }}
          />
        ))}
      </div>
      {comContatos ? (
        <div className="mt-1 flex gap-[2px]" aria-hidden>
          {dias.map((d) => (
            <span key={d.dia} className="flex min-w-[2px] flex-1 justify-center">
              {d.leads > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
            </span>
          ))}
        </div>
      ) : null}
      <figcaption className="mt-2 flex justify-between text-apoio text-ink-mute">
        <span>{diaCurto(primeiro)}</span>
        {comContatos ? <span>Ponto: dia com contato ({inteiro(totalDeContatos)} no total)</span> : null}
        <span>{diaCurto(ultimo)}</span>
      </figcaption>
    </figure>
  );
}

/**
 * A análise da IA, ainda sem o modelo ligado.
 *
 * Um texto fixo fingindo análise seria pior que nenhum: a caixa diz o que
 * falta e o que a análise vai considerar quando existir.
 */
function AnaliseDaIa({
  linha,
  rotuloDoPeriodo,
  perfilDoNegocio,
}: {
  linha: LinhaDeCampanha;
  rotuloDoPeriodo: string;
  perfilDoNegocio: string | null;
}) {
  return (
    <section className="rounded-xl border border-dashed border-line px-4 py-4">
      <h3 className="text-corpo font-semibold text-ink">Análise da IA</h3>
      <p className="mt-1.5 text-corpo text-ink-soft">
        A análise automática ainda não está ativa nesta conta. Os números acima vêm direto dos canais e do sistema.
      </p>
      <p className="mt-3 text-apoio text-ink-mute">
        Quando estiver ativa, vai considerar o objetivo {ROTULO_DO_OBJETIVO[linha.objetivo].toLowerCase()}, o período de{" "}
        {rotuloDoPeriodo} e o resultado rastreado
        {linha.resultado.custoCentavos !== null ? `, inclusive o custo de ${custo(linha.resultado.custoCentavos)} por ${linha.resultado.unidade[0]}` : ""}.
      </p>
      <p className="mt-2 text-apoio text-ink-mute">
        {perfilDoNegocio ? (
          <>Do perfil do negócio: {perfilDoNegocio}.</>
        ) : (
          <>
            O perfil do negócio ainda não foi preenchido.{" "}
            <Link href="/settings?aba=negocio" className="font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
              Preencher o perfil
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

function diaCurto(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}
