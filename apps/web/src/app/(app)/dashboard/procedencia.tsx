import Link from "next/link";
import { formataDia } from "@/lib/periodo";
import type { Overview } from "./tipos";

/**
 * De onde estes números vêm, e o que não está neles.
 *
 * É a menor área da tela e a que mais protege quem apresenta. Um filtro ou uma
 * procedência não declarada é a causa mais comum de discussão numa reunião:
 * escrito, deixa de ser discussão e vira consulta.
 *
 * A cobertura de origem mora aqui e aparece **sempre**, com qualquer valor.
 * Antes ela só aparecia como alerta quando passava de metade dos leads, e um
 * limiar tem um problema que nenhum ajuste resolve: com 49% sem origem a tela
 * não dizia nada, e quem lia a aba de origem acreditava estar vendo o quadro
 * inteiro. O alerta continua existindo para quando está ruim de verdade; o que
 * mudou é que o número deixou de depender dele para ser dito.
 */
export function Procedencia({ overview }: { overview: Overview }) {
  const { totals, byOrigin, period, setup } = overview;

  const semOrigem = byOrigin.find((bucket) => bucket.key === "unknown")?.leads ?? 0;
  const comOrigem = totals.leads - semOrigem;
  const cobertura = totals.leads > 0 ? Math.round((comOrigem / totals.leads) * 100) : null;

  return (
    <footer className="mt-6 border-t border-line pt-5">
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-rotulo leading-relaxed text-ink-mute">
        <Linha rotulo="Período" valor={`${formataDia(period.from.slice(0, 10))} a ${formataDia(period.to.slice(0, 10))}`} />
        <Linha
          rotulo="Leads"
          valor={setup.whatsappConnected ? "WhatsApp conectado, em tempo real" : "WhatsApp desconectado"}
        />
        <Linha
          rotulo="Origem identificada"
          valor={
            // Zero por cento é medida; sem lead nenhum não há percentual a dar.
            cobertura === null ? "Sem lead no período" : `${comOrigem} de ${totals.leads} leads (${cobertura}%)`
          }
        />
        <Linha rotulo="Receita" valor="Somente vendas com valor registrado à mão" />
      </dl>

      <p className="mt-3 max-w-prose text-rotulo leading-relaxed text-ink-mute">
        A origem só é registrada quando a pessoa chega por um anúncio de clique para o WhatsApp ou por um link
        rastreado. Quem manda mensagem direto para o número não carrega essa evidência, e ela nunca é deduzida por
        aproximação.{" "}
        <Link href="/verba" className="link">
          O detalhe por anúncio fica na aba Verba.
        </Link>
      </p>
    </footer>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-[0.1em]">{rotulo}</dt>
      <dd className="mt-0.5 text-ink-soft">{valor}</dd>
    </div>
  );
}
