import Link from "next/link";
import { AvisoDeCobertura, comparavel } from "@/components/aviso-de-cobertura";
import { formatCentsAsBRL } from "@/lib/currency";
import { Conjunto, Metrica } from "@/lib/campanhas/metricas";
import { Resumo, resumoDaMetrica, SeletorDeMetricas, somaAnteriores } from "../campanhas/metricas-ui";
import type { DesempenhoDeCampanhas } from "../campanhas/tipos";

/**
 * Os números dos anúncios no painel: investimento, impressões, cliques, CTR,
 * CPM e o resto, com a variação contra o período anterior do mesmo tamanho.
 *
 * Com as mesmas peças da tela de Campanhas, e a mesma escolha de métricas:
 * o painel e a tela de Campanhas não podem dar dois números diferentes para
 * a mesma coisa. Aqui só o total; o detalhe por campanha fica a um clique.
 */
export function SecaoDeAnuncios({
  dados,
  metricas,
  escolhaManual,
  sugestao,
  medido,
  href,
  porCampanha,
}: {
  dados: DesempenhoDeCampanhas;
  metricas: Metrica[];
  escolhaManual: boolean;
  sugestao: { conjunto: Conjunto; objetivo: string | null };
  /** Sem WhatsApp medindo, o que depende de lead aparece como "Sem medida". */
  medido: boolean;
  /** O endereço do painel com outra escolha de métricas. */
  href: (lista: Metrica[] | null) => string;
  /** A tela de Campanhas no mesmo período e com a mesma escolha. */
  porCampanha: string;
}) {
  const { totais, campanhas, comparacao } = dados;
  // O período anterior começando antes do primeiro dia com número: sem porcentagem.
  const anteriores = comparacao && comparavel(dados.parcial) ? somaAnteriores(campanhas) : null;

  return (
    <section className="surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Anúncios no período</h2>
          <p className="mt-0.5 text-apoio text-ink-mute">
            O que as plataformas contam e o que virou lead aqui, contra o período anterior do mesmo tamanho.
          </p>
        </div>
        <Link
          href={porCampanha}
          className="focus-ring text-apoio font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          Ver por campanha
        </Link>
      </div>

      <div className="mt-4">
        <SeletorDeMetricas metricas={metricas} escolhaManual={escolhaManual} sugestao={sugestao} href={href} />
      </div>

      <AvisoDeCobertura
        cobertura={dados.cobertura}
        parcial={dados.parcial}
        periodo={dados.periodo}
        comparacao={comparacao}
        rotuloDaComparacao="o período anterior"
        className="mb-4"
      />

      {campanhas.length === 0 ? (
        <p className="text-corpo text-ink-mute">
          Nenhuma campanha com gasto ou lead no período. Conecte a Meta em Integrações, ou lance o gasto por CSV ou à
          mão, para os números aparecerem aqui.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Resumo
            titulo="Investimento"
            valor={formatCentsAsBRL(totais.gastoCentavos)}
            atual={totais.gastoCentavos}
            anterior={anteriores?.gastoCentavos}
          />
          {metricas.map((metrica) => (
            <Resumo key={metrica} {...resumoDaMetrica(metrica, totais, anteriores, medido)} />
          ))}
        </div>
      )}
    </section>
  );
}
