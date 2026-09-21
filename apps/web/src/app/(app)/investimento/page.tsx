import { apiFetch } from "@/lib/api-client";
import { intervaloDoMes, leIntervalo, mesAtual, formataDia } from "@/lib/periodo";
import { formatCentsAsBRL } from "@/lib/currency";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { PainelDaVerba } from "./painel-da-verba";
import { TabelaDeAnuncios } from "./tabela-de-anuncios";
import { Procedencia } from "./procedencia";
import { Anuncios, SituacaoDaVerba } from "./tipos";

interface Busca {
  de?: string;
  ate?: string;
}

export default async function InvestimentoPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;

  // Sem período na URL, o mês corrente: é o que se quer ver ao abrir a tela.
  const agora = mesAtual();
  const periodo = leIntervalo(params.de, params.ate) ?? intervaloDoMes(agora.ano, agora.mes);

  const [verba, dados] = await Promise.all([
    apiFetch<SituacaoDaVerba | null>("/verbas/resumo"),
    apiFetch<Anuncios>(`/analytics/anuncios?de=${periodo.de}&ate=${periodo.ate}`),
  ]);

  const mesesRecentes = ultimosMeses(6);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
              {formataDia(periodo.de)} a {formataDia(periodo.ate)}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
              Investimento
            </h1>
            {/*
              O subtítulo conclui em vez de descrever: com números na mão, ele
              diz o que aconteceu no período, não o nome da tela.
            */}
            <p className="mt-0.5 text-corpo text-ink-mute">{resumoEmUmaLinha(dados)}</p>
          </div>

          <GrupoDePilulas
            ativo={`${periodo.de}|${periodo.ate}`}
            opcoes={mesesRecentes.map((mes) => ({
              chave: `${mes.de}|${mes.ate}`,
              rotulo: mes.rotulo,
              href: `/investimento?de=${mes.de}&ate=${mes.ate}`,
            }))}
          />
        </div>
      </header>

      <PainelDaVerba situacao={verba} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Por anúncio</h2>
          {dados.totais.semRetorno > 0 ? (
            <p className="text-corpo text-ink-mute">
              <span className="font-medium text-ink">{dados.totais.semRetorno}</span>{" "}
              {dados.totais.semRetorno === 1
                ? "anúncio gastou sem trazer lead"
                : "anúncios gastaram sem trazer lead"}
            </p>
          ) : null}
        </div>

        <TabelaDeAnuncios anuncios={dados.anuncios} />
      </section>

      <Procedencia dados={dados} periodo={periodo} />
    </div>
  );
}

/**
 * A conclusão do período em uma linha.
 *
 * Um título que descreve ("Investimento") obriga a ler a tela inteira para
 * saber o que houve. Com um número e uma comparação, a primeira linha já
 * conclui.
 */
function resumoEmUmaLinha(dados: Anuncios): string {
  const { gastoCentavos, leads, vendas } = dados.totais;

  if (gastoCentavos === 0) {
    return "Nenhum investimento registrado neste período.";
  }
  if (leads === 0) {
    return `${formatCentsAsBRL(gastoCentavos)} investidos e nenhum lead atribuído ainda.`;
  }

  const porLead = formatCentsAsBRL(Math.round(gastoCentavos / leads));
  const venda = vendas > 0 ? `, ${vendas} ${vendas === 1 ? "virou cliente" : "viraram clientes"}` : "";
  return `${formatCentsAsBRL(gastoCentavos)} investidos, ${leads} ${leads === 1 ? "lead" : "leads"} a ${porLead} cada${venda}.`;
}

/** Os últimos meses, para trocar de período sem digitar data. */
function ultimosMeses(quantos: number) {
  const hoje = mesAtual();
  return Array.from({ length: quantos }, (_, i) => {
    const deslocado = hoje.mes - i;
    const ano = hoje.ano + Math.floor((deslocado - 1) / 12);
    const mes = ((((deslocado - 1) % 12) + 12) % 12) + 1;
    const intervalo = intervaloDoMes(ano, mes);
    return {
      ...intervalo,
      rotulo: new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", {
        month: "short",
        timeZone: "UTC",
      }),
    };
  });
}
