import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Frescor, FrescorDosDados } from "@/components/ui/frescor";
import { formatCentsAsBRL } from "@/lib/currency";
import { rotuloDoIntervalo } from "@/lib/periodo";
import { MedicaoLocal, SituacaoDaMedicao } from "../dashboard/painel-presenca-local";
import { Numero, Resumo, SeletorDePeriodo, STATUS } from "./campanhas-view";

type Par = { atual: number | null; anterior: number | null };

interface NumerosDaCampanha {
  gastoCentavos: number;
  cliques: number;
  impressoes: number;
  /** `null` quando a parte do script que mede não está chegando. */
  ligacoes: number | null;
  rotas: number | null;
  custoPorLigacao: number | null;
  custoPorRota: number | null;
}

/** O que a rota `GET /presenca-local/campanhas` devolve. */
export interface CampanhasDePresencaLocal extends MedicaoLocal {
  periodo: { de: string; ate: string };
  comparacao: { de: string; ate: string } | null;
  totais: Record<"gastoCentavos" | "cliques" | "impressoes" | "ligacoes" | "rotas" | "custoPorLigacao" | "custoPorRota", Par>;
  campanhas: {
    externalId: string;
    nome: string;
    status: string;
    /** Null quando a campanha não rodou naquele período. Não é zero: é ausência. */
    atual: NumerosDaCampanha | null;
    anterior: NumerosDaCampanha | null;
  }[];
}

const variacao = (atual: number | null, anterior: number | null) =>
  atual === null || anterior === null ? undefined : { delta: anterior === 0 ? null : (atual - anterior) / anterior, anterior };

/**
 * A tela de campanhas de quem vive de presença local: de cada campanha do
 * Google, quanto saiu e quantas ligações e pedidos de rota voltaram. O mesmo
 * seletor de mês e a mesma comparação da tela de leads, com outras colunas.
 */
export function CampanhasLocaisView({
  dados,
  abas,
  aba,
  frescor = null,
}: {
  dados: CampanhasDePresencaLocal;
  abas?: ReactNode;
  /** A aba a manter na troca de mês, para quem tem os dois focos. */
  aba?: string;
  /** De quando é o último envio do Google Ads. */
  frescor?: Frescor | null;
}) {
  const { periodo, comparacao, totais } = dados;
  const comparando = comparacao !== null;
  const rotuloDaComparacao = comparacao ? rotuloDoIntervalo(comparacao) : null;

  const resumo = (par: Par, formata: (valor: number) => string, semValor = "Sem medida") => ({
    valor: par.atual === null ? semValor : formata(par.atual),
    atual: par.atual ?? undefined,
    anterior: comparando && par.anterior !== null ? par.anterior : undefined,
    apagado: par.atual === null,
  });
  const inteiro = (valor: number) => valor.toLocaleString("pt-BR");
  // Custo sem ação para dividir não é falta de medida: é "nenhuma no período".
  const semAcao = (acoes: Par, texto: string) => (acoes.atual === null ? "Sem medida" : texto);

  return (
    <div className="mx-auto max-w-6xl">
      {abas}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Campanhas</h1>
          <p className="mt-1 max-w-2xl text-corpo text-ink-mute">
            Quanto cada campanha do Google custou, e quantas ligações e pedidos de rota ela trouxe.
          </p>
          <FrescorDosDados frescor={frescor} fontes={["google"]} className="mt-2" />
        </div>
        <SeletorDePeriodo periodo={periodo} comparacao={comparacao} aba={aba} />
      </header>

      {dados.situacao !== "medido" ? (
        <div className="mb-5">
          <SituacaoDaMedicao medicao={dados} />
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Resumo titulo="Investimento" {...resumo(totais.gastoCentavos, formatCentsAsBRL)} />
        <Resumo titulo="Ligações" {...resumo(totais.ligacoes, inteiro)} nota="Pelo botão de ligar dos anúncios" />
        <Resumo titulo="Pedidos de rota" {...resumo(totais.rotas, inteiro)} />
        <Resumo
          titulo="Custo por ligação"
          {...resumo(totais.custoPorLigacao, formatCentsAsBRL, semAcao(totais.ligacoes, "Sem ligação"))}
          invertido
        />
        <Resumo
          titulo="Custo por rota"
          {...resumo(totais.custoPorRota, formatCentsAsBRL, semAcao(totais.rotas, "Sem rota"))}
          invertido
        />
      </div>

      {dados.campanhas.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-corpo text-ink-soft">Nenhuma campanha do Google com gasto em {rotuloDoIntervalo(periodo)}.</p>
          <p className="mt-1.5 text-apoio text-ink-mute">
            As campanhas aparecem aqui quando o script do Google Ads, em Integrações, manda o gasto do mês.
          </p>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          {/* A tabela é larga de propósito; quem rola é ela, nunca a página. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-corpo">
              <thead>
                <tr className="border-b border-line text-left text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                  <th className="px-4 py-3 font-semibold">Campanha</th>
                  <th className="px-4 py-3 text-right font-semibold">Investimento</th>
                  <th className="px-4 py-3 text-right font-semibold">Cliques</th>
                  <th className="px-4 py-3 text-right font-semibold">Ligações</th>
                  <th className="px-4 py-3 text-right font-semibold">Rotas</th>
                  <th className="px-4 py-3 text-right font-semibold">Custo por ligação</th>
                  <th className="px-4 py-3 text-right font-semibold">Custo por rota</th>
                </tr>
              </thead>
              <tbody>
                {dados.campanhas.map((linha) => {
                  // A campanha que só rodou na comparação continua na tabela:
                  // "não rodou" é metade da explicação de uma queda.
                  const ausente = linha.atual === null;
                  const n = linha.atual ?? linha.anterior!;
                  const antes = comparando && !ausente ? linha.anterior : null;
                  const status = STATUS[linha.status];
                  const compara = (campo: keyof NumerosDaCampanha) =>
                    comparando && !ausente ? variacao(n[campo], antes ? antes[campo] : 0) : undefined;

                  return (
                    <tr key={linha.externalId} className={`border-b border-line/60 last:border-0 ${ausente ? "opacity-55" : ""}`}>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-ink">{linha.nome}</p>
                        {status ? (
                          <div className="mt-1.5">
                            <Badge tone={status.tom} dot>
                              {status.rotulo}
                            </Badge>
                          </div>
                        ) : null}
                        {ausente ? (
                          <p className="mt-1 text-rotulo text-ink-mute">
                            Não rodou no período escolhido. Os números ao lado são de {rotuloDaComparacao}.
                          </p>
                        ) : null}
                      </td>
                      <Numero valor={formatCentsAsBRL(n.gastoCentavos)} variacao={compara("gastoCentavos")} />
                      <Numero valor={inteiro(n.cliques)} />
                      <Acoes valor={n.ligacoes} variacao={compara("ligacoes")} />
                      <Acoes valor={n.rotas} variacao={compara("rotas")} />
                      <Custo valor={n.custoPorLigacao} acoes={n.ligacoes} nenhuma="Sem ligação" />
                      <Custo valor={n.custoPorRota} acoes={n.rotas} nenhuma="Sem rota" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <dl className="mt-5 grid gap-x-8 gap-y-3 text-apoio leading-relaxed text-ink-mute md:grid-cols-3">
        <div>
          <dt className="font-semibold text-ink-soft">Ligações</dt>
          <dd>Quem ligou pelo botão de ligar do anúncio, como o Google conta.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Pedidos de rota</dt>
          <dd>Quem pediu o caminho até o endereço a partir do anúncio, no Maps ou na busca.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Custo por ligação</dt>
          <dd>O investimento dividido pelas ligações. O mesmo vale para o custo por rota.</dd>
        </div>
      </dl>
    </div>
  );
}

function Acoes({ valor, variacao }: { valor: number | null; variacao?: { delta: number | null; anterior: number } }) {
  if (valor === null) return <Numero valor="Sem medida" apagado />;
  return <Numero valor={valor.toLocaleString("pt-BR")} variacao={variacao} />;
}

function Custo({ valor, acoes, nenhuma }: { valor: number | null; acoes: number | null; nenhuma: string }) {
  if (acoes === null) return <Numero valor="Sem medida" apagado />;
  if (valor === null) return <Numero valor={nenhuma} apagado />;
  return <Numero valor={formatCentsAsBRL(valor)} />;
}
