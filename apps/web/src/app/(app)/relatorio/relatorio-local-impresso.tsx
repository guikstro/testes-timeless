import { formatCentsAsBRL } from "@/lib/currency";
import { formataDia } from "@/lib/periodo";
import { Marca } from "@/components/marca";
import type { DadosDePresencaLocal } from "@/lib/relatorio/dados";
import { concluiRelatorioLocal } from "@/lib/relatorio/conclusao";
import { Conclusao, Numero, Secao } from "./relatorio-impresso";

function variacao(atual: number | null, anterior: number | null): string | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  const delta = Math.round(((atual - anterior) / anterior) * 100);
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

const numero = (valor: number | null) => (valor === null ? "Sem medida" : valor.toLocaleString("pt-BR"));

/**
 * O relatório de quem vive de presença local: ligações e pedidos de rota que
 * os anúncios do Google trouxeram, e quanto cada um custou. Mesma assinatura e
 * mesmo desenho do relatório de leads, com outras perguntas.
 */
export function RelatorioLocalImpresso({ dados }: { dados: DadosDePresencaLocal }) {
  const { ligacoes, rotas, visitas, investimento } = dados;
  const investido = investimento.atual;
  const custoPorLigacao = investido && ligacoes.atual ? Math.round(investido / ligacoes.atual) : null;
  const custoPorRota = investido && rotas.atual ? Math.round(investido / rotas.atual) : null;
  const frase = concluiRelatorioLocal({ ligacoes: ligacoes.atual, rotas: rotas.atual, investidoCentavos: investido });

  return (
    <article className="space-y-8 print:space-y-6">
      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2 text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
          <Marca tamanho={14} className="shrink-0 text-accent" />
          Relatório de presença local
        </p>
        <h2 className="mt-1 font-display text-[clamp(1.7rem,4vw,2.4rem)] font-semibold tracking-tight text-ink">
          {dados.cliente}
        </h2>
        <p className="mt-1 text-corpo text-ink-soft">
          {formataDia(dados.periodo.de)} a {formataDia(dados.periodo.ate)} · {dados.periodo.dias} dias
        </p>
        {frase ? <Conclusao frase={frase} /> : null}
      </header>

      <Secao titulo="O período em números">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Numero rotulo="Ligações" valor={numero(ligacoes.atual)} nota={variacao(ligacoes.atual, ligacoes.anterior)} destaque />
          <Numero rotulo="Pedidos de rota" valor={numero(rotas.atual)} nota={variacao(rotas.atual, rotas.anterior)} destaque />
          <Numero rotulo="Visitas à loja" valor={numero(visitas.atual)} nota={variacao(visitas.atual, visitas.anterior)} />
          <Numero
            rotulo="Investido"
            valor={investido === null ? "Sem medida" : formatCentsAsBRL(investido)}
            nota={variacao(investimento.atual, investimento.anterior)}
          />
        </div>
      </Secao>

      {custoPorLigacao !== null || custoPorRota !== null ? (
        <Secao titulo="Quanto custou cada ação">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {custoPorLigacao !== null ? <Numero rotulo="Por ligação" valor={formatCentsAsBRL(custoPorLigacao)} /> : null}
            {custoPorRota !== null ? <Numero rotulo="Por pedido de rota" valor={formatCentsAsBRL(custoPorRota)} /> : null}
          </div>
        </Secao>
      ) : null}

      {dados.campanhas.length > 0 ? (
        <Secao titulo="Por campanha">
          <table className="w-full text-left text-corpo">
            <thead>
              <tr className="border-b border-line/70 text-rotulo uppercase tracking-[0.08em] text-ink-mute">
                <th className="py-2 pr-4 font-semibold">Campanha</th>
                <th className="py-2 pr-4 text-right font-semibold">Investido</th>
                <th className="py-2 pr-4 text-right font-semibold">Ligações</th>
                <th className="py-2 text-right font-semibold">Rotas</th>
              </tr>
            </thead>
            <tbody>
              {dados.campanhas.map((c, i) => (
                <tr key={`${c.nome}-${i}`} className="border-b border-line/50 last:border-0">
                  <td className="py-2.5 pr-4 text-ink">{c.nome}</td>
                  <td className="tnum py-2.5 pr-4 text-right text-ink-soft">{formatCentsAsBRL(c.gastoCentavos)}</td>
                  <td className="tnum py-2.5 pr-4 text-right text-ink-soft">{numero(c.ligacoes)}</td>
                  <td className="tnum py-2.5 text-right text-ink-soft">{numero(c.rotas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      ) : null}

      <p className="text-apoio leading-relaxed text-ink-mute">
        Números medidos pelo Google Ads. Ligações e rotas que não vieram de anúncio, as do Perfil da Empresa no Google,
        não estão neste relatório.
      </p>
    </article>
  );
}
