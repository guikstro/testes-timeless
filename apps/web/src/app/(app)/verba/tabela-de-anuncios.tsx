import { formatCentsAsBRL } from "@/lib/currency";
import { DesempenhoDoAnuncio } from "./tipos";

/**
 * O desempenho de cada criativo.
 *
 * Ordenada pelo que consome mais verba, porque a ordem é informação: o
 * anúncio que leva mais dinheiro é o que mais importa acertar, mesmo indo
 * bem. Alfabética seria desistir de informar.
 */
export function TabelaDeAnuncios({ anuncios }: { anuncios: DesempenhoDoAnuncio[] }) {
  if (anuncios.length === 0) {
    return (
      <div className="surface p-8 text-center">
        <p className="text-destaque font-medium text-ink">Nenhum anúncio com gasto neste período</p>
        <p className="mx-auto mt-1.5 max-w-md text-corpo text-ink-mute">
          O gasto por anúncio vem da sincronização com a Meta e cobre os últimos sete dias a cada
          rodada. Períodos anteriores à conexão da conta não têm este detalhe.
        </p>
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left">
          <thead>
            <tr className="border-b border-line text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
              <th className="px-4 py-3 font-semibold">Anúncio</th>
              <th className="px-4 py-3 text-right font-semibold">Investido</th>
              <th className="px-4 py-3 text-right font-semibold">Leads</th>
              <th className="px-4 py-3 text-right font-semibold">Por lead</th>
              <th className="px-4 py-3 text-right font-semibold">Clientes</th>
              <th className="px-4 py-3 text-right font-semibold">Por cliente</th>
              <th className="px-4 py-3 text-right font-semibold">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {anuncios.map((anuncio) => {
              const desperdicio = anuncio.gastoCentavos > 0 && anuncio.leads === 0;
              return (
                <tr
                  key={anuncio.adId}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-soft/50"
                >
                  <td className="px-4 py-3">
                    <p className="text-corpo font-medium text-ink">{anuncio.name}</p>
                    <p className="text-apoio text-ink-mute">
                      {anuncio.campanha}
                      {anuncio.status !== "ACTIVE" ? ` · ${rotuloDeStatus(anuncio.status)}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-corpo text-ink">
                    {formatCentsAsBRL(anuncio.gastoCentavos)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-corpo text-ink">{anuncio.leads}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums text-corpo ${
                      desperdicio ? "text-red-600 dark:text-red-400" : "text-ink"
                    }`}
                  >
                    {/*
                      Sem lead, o custo por lead não é alto: é desconhecido.
                      Mostrar um número aqui seria inventar uma divisão por
                      zero com cara de medida.
                    */}
                    {anuncio.custoPorLeadCentavos === null
                      ? desperdicio
                        ? "Sem lead"
                        : "—"
                      : formatCentsAsBRL(anuncio.custoPorLeadCentavos)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-corpo text-ink">{anuncio.vendas}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-corpo text-ink">
                    {anuncio.custoPorVendaCentavos === null
                      ? "—"
                      : formatCentsAsBRL(anuncio.custoPorVendaCentavos)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-corpo">
                    {anuncio.retorno === null ? (
                      <span className="text-ink-mute">—</span>
                    ) : (
                      <span className={anuncio.retorno >= 1 ? "text-accent" : "text-ink"}>
                        {anuncio.retorno.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}x
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A Meta manda o status em inglês e em caixa alta; a tela fala português. */
function rotuloDeStatus(status: string): string {
  const conhecidos: Record<string, string> = {
    PAUSED: "Pausado",
    ARCHIVED: "Arquivado",
    DELETED: "Excluído",
    ADSET_PAUSED: "Conjunto pausado",
    CAMPAIGN_PAUSED: "Campanha pausada",
  };
  return conhecidos[status] ?? status;
}
