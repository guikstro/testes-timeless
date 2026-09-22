import { apiFetch } from "@/lib/api-client";
import { intervaloDoMes, leIntervalo, mesAtual, formataDia } from "@/lib/periodo";
import { formatCentsAsBRL } from "@/lib/currency";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { PainelDaVerba } from "./painel-da-verba";
import { ExtratoDiario } from "./extrato-diario";
import { TabelaDeAnuncios } from "./tabela-de-anuncios";
import { Identificacao } from "./identificacao";
import { HistoricoDeVerbas } from "./historico-de-verbas";
import { Procedencia } from "./procedencia";
import { SaudeDaContaMeta } from "./saude-da-conta";
import { Anuncios, SaudeDaConta, SituacaoDaVerba, Verba } from "./tipos";

interface Busca {
  de?: string;
  ate?: string;
}

/**
 * A verba: quanto foi combinado, quanto já saiu, em que dia saiu e por qual
 * anúncio.
 *
 * A ordem das seções é a ordem das perguntas, não a ordem em que elas foram
 * construídas:
 *
 *   1. Quanto sobra e até quando dá.      (o painel)
 *   2. Como o dinheiro saiu ao longo do mês. (o extrato)
 *   3. Para onde ele foi.                  (a tabela por anúncio)
 *   4. De quanto disso dá para ter certeza. (a identificação)
 *   5. O que foi combinado, e quando.       (o histórico)
 *   6. De onde vêm estes números.           (a procedência)
 *
 * A identificação vem logo depois da tabela de propósito: ela é a ressalva da
 * tabela, e ressalva que aparece no fim da página chega tarde demais.
 */
export default async function VerbaPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;

  // Sem período na URL, o mês corrente: é o que se quer ver ao abrir a tela.
  const agora = mesAtual();
  const periodo = leIntervalo(params.de, params.ate) ?? intervaloDoMes(agora.ano, agora.mes);

  const [situacao, verbas, dados, sessao, saude] = await Promise.all([
    apiFetch<SituacaoDaVerba | null>("/verbas/resumo"),
    apiFetch<Verba[]>("/verbas"),
    apiFetch<Anuncios>(`/analytics/anuncios?de=${periodo.de}&ate=${periodo.ate}`),
    apiFetch<{ role: "OWNER" | "ADMIN" | "MEMBER" }>("/auth/session"),
    apiFetch<SaudeDaConta | null>("/integrations/meta/saude"),
  ]);

  /*
    Quem atende lê tudo e não escreve nada. Esconder o botão é cortesia: a
    trava de verdade está no servidor, que confere papel, escopo e verba antes
    de tocar na conta.
  */
  const podeControlar = sessao.role === "OWNER" || sessao.role === "ADMIN";

  const hoje = hojeEmBrasilia();
  const mesesRecentes = ultimosMeses(6);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
              {formataDia(periodo.de)} a {formataDia(periodo.ate)}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Verba</h1>
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
              href: `/verba?de=${mes.de}&ate=${mes.ate}`,
            }))}
          />
        </div>
      </header>

      {/*
        Acima do painel de propósito: com a conta parada, nenhum número abaixo
        quer dizer o que parece querer.
      */}
      <SaudeDaContaMeta saude={saude} />

      <PainelDaVerba situacao={situacao} gastoDeHoje={gastoDeHoje(dados, hoje)} />

      <ExtratoDiario dias={dados.porDia} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Para onde foi</h2>
          {dados.totais.semRetorno > 0 ? (
            <p className="text-corpo text-ink-mute">
              <span className="font-medium text-ink">{dados.totais.semRetorno}</span>{" "}
              {dados.totais.semRetorno === 1
                ? "anúncio gastou sem trazer lead"
                : "anúncios gastaram sem trazer lead"}
            </p>
          ) : null}
        </div>

        <TabelaDeAnuncios anuncios={dados.anuncios} podeControlar={podeControlar} />
      </section>

      <Identificacao dados={dados.identificacao} />

      <HistoricoDeVerbas verbas={verbas} hoje={hoje} />

      <Procedencia dados={dados} periodo={periodo} />
    </div>
  );
}

/**
 * A conclusão do período em uma linha.
 *
 * Um título que descreve ("Verba") obriga a ler a tela inteira para saber o
 * que houve. Com um número e uma comparação, a primeira linha já conclui.
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

/**
 * Quanto saiu hoje.
 *
 * Null em dois casos que a tela precisa tratar igual, porque nos dois o número
 * não existe: hoje está fora do período que se está olhando (um mês passado),
 * e a sincronia ainda não cobriu o dia.
 */
function gastoDeHoje(dados: Anuncios, hoje: string): number | null {
  return dados.porDia.find((dia) => dia.dia === hoje)?.gastoCentavos ?? null;
}

/** O dia do cliente, que é o de Brasília, e não o do servidor. */
function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
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
