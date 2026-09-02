import Link from "next/link";
import { Delta } from "@/components/ui/delta";
import { formatCentsAsBRL } from "@/lib/currency";
import {
  formataDia,
  Intervalo,
  intervaloDoMes,
  MESES_CURTOS,
  mesDoIntervalo,
  rotuloDoIntervalo,
} from "@/lib/periodo";
import { CampanhaComparada, DesempenhoDeCampanhas } from "./tipos";

/**
 * Separado da página pelo mesmo motivo da tela de relatório: a página busca no
 * servidor, esta vista só desenha, e assim a apresentação pode ser conferida
 * sem depender de dados reais.
 */
export function CampanhasView({
  dados,
  ano,
  anoComparacao,
}: {
  dados: DesempenhoDeCampanhas;
  /** Ano que o seletor está mostrando, que não precisa ser o do período escolhido. */
  ano: number;
  anoComparacao: number;
}) {
  const { periodo, comparacao, campanhas, semCampanha, totais } = dados;
  const roasGeral = totais.gastoCentavos > 0 ? totais.receitaCentavos / totais.gastoCentavos : null;

  // Os totais do período de comparação saem das próprias linhas: a API já
  // devolve os dois lados de cada campanha, e somá-los aqui evita uma segunda
  // rota que diria a mesma coisa.
  const anteriores = comparacao
    ? campanhas.reduce(
        (soma, linha) => ({
          gastoCentavos: soma.gastoCentavos + (linha.anterior?.gastoCentavos ?? 0),
          leads: soma.leads + (linha.anterior?.leads ?? 0),
          vendas: soma.vendas + (linha.anterior?.vendas ?? 0),
          receitaCentavos: soma.receitaCentavos + (linha.anterior?.receitaCentavos ?? 0),
        }),
        { gastoCentavos: 0, leads: 0, vendas: 0, receitaCentavos: 0 },
      )
    : null;

  /*
    Campanha criada à mão sem o id real da plataforma nunca casa com lead
    nenhum: o cruzamento usa o id que vem no clique. Sem este aviso, a linha
    com gasto e zero leads é lida como "a campanha não converte", quando o
    problema é de configuração.
  */
  const semIdDaPlataforma = campanhas.filter(
    (linha) =>
      linha.externalId.startsWith("manual:") &&
      linha.atual !== null &&
      linha.atual.gastoCentavos > 0 &&
      linha.atual.leads === 0,
  ).length;

  function url(novo: { periodo?: Intervalo; comparacao?: Intervalo | null; ano?: number; anoCmp?: number }) {
    const p = novo.periodo ?? periodo;
    const c = novo.comparacao === undefined ? comparacao : novo.comparacao;
    const params = new URLSearchParams({ de: p.de, ate: p.ate });
    if (c) {
      params.set("compararDe", c.de);
      params.set("compararAte", c.ate);
    }
    params.set("ano", String(novo.ano ?? ano));
    params.set("anoCmp", String(novo.anoCmp ?? anoComparacao));
    return `/campanhas?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Campanhas</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">
        O que cada campanha custou e o que ela trouxe de volta, no mês que você escolher.
      </p>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <SeletorDeMes
          titulo="Período"
          ano={ano}
          selecionado={mesDoIntervalo(periodo)}
          href={(mes) => url({ periodo: intervaloDoMes(ano, mes) })}
          hrefDoAno={(destino) => url({ ano: destino })}
        />
        <SeletorDeMes
          titulo="Comparar com"
          ano={anoComparacao}
          selecionado={comparacao ? mesDoIntervalo(comparacao) : null}
          href={(mes) => url({ comparacao: intervaloDoMes(anoComparacao, mes) })}
          hrefDoAno={(destino) => url({ anoCmp: destino })}
          hrefSemComparacao={comparacao ? url({ comparacao: null }) : null}
        />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo
          titulo="Investimento"
          valor={formatCentsAsBRL(totais.gastoCentavos)}
          anterior={anteriores?.gastoCentavos}
          atual={totais.gastoCentavos}
        />
        <Resumo titulo="Leads atribuídos" valor={String(totais.leads)} anterior={anteriores?.leads} atual={totais.leads} />
        <Resumo titulo="Vendas" valor={String(totais.vendas)} anterior={anteriores?.vendas} atual={totais.vendas} />
        <Resumo
          titulo="Retorno sobre o investimento"
          valor={roasGeral === null ? "Sem investimento lançado" : `${roasGeral.toFixed(2).replace(".", ",")}x`}
        />
      </div>

      {campanhas.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-sm text-ink-soft">Nenhuma campanha com gasto ou lead em {rotuloDoIntervalo(periodo)}.</p>
          <p className="mt-1.5 text-[12.5px] text-ink-mute">
            Lance o gasto em Integrações, por importação de CSV ou manualmente, para as campanhas aparecerem aqui.
          </p>
        </div>
      ) : (
        <Tabela
          campanhas={campanhas}
          rotuloDaComparacao={comparacao ? rotuloDoIntervalo(comparacao) : null}
        />
      )}

      {/*
        A soma das linhas não fecha com o total de leads da organização, e uma
        tabela que não diz isso passa a impressão de que as campanhas respondem
        por tudo o que entra.
      */}
      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-mute">
        {semCampanha.atual > 0 ? (
          <>
            Mais {semCampanha.atual} {semCampanha.atual === 1 ? "lead entrou" : "leads entraram"} no período sem
            campanha identificada, por chegada direta ou por clique sem rastreio. Eles não entram em nenhuma linha
            acima.
          </>
        ) : (
          <>Todos os leads do período têm campanha identificada.</>
        )}{" "}
        Dias ativos contam apenas os dias com gasto lançado, então uma campanha que rodou sem o gasto ser importado
        aparece com menos dias do que teve.
      </p>

      {semIdDaPlataforma > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-mute">
          {semIdDaPlataforma === 1 ? "Uma campanha aparece" : `${semIdDaPlataforma} campanhas aparecem`} com gasto e
          nenhum lead porque {semIdDaPlataforma === 1 ? "foi criada" : "foram criadas"} sem o id da plataforma. O lead
          é ligado à campanha pelo id que chega no clique, então preencha o id real do Google Ads ou do Meta ao criar a
          campanha, e use links de rastreio que carreguem esse id.
        </p>
      )}
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  atual,
  anterior,
}: {
  titulo: string;
  valor: string;
  atual?: number;
  /** Ausente quando não há período de comparação escolhido. */
  anterior?: number;
}) {
  const compara = anterior !== undefined && atual !== undefined;

  return (
    <div className="surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</p>
      <p className="mt-1.5 font-display text-xl font-semibold tabular-nums text-ink">{valor}</p>
      {compara && (
        <div className="mt-1">
          <Delta delta={anterior === 0 ? null : (atual - anterior) / anterior} />
        </div>
      )}
    </div>
  );
}

function SeletorDeMes({
  titulo,
  ano,
  selecionado,
  href,
  hrefDoAno,
  hrefSemComparacao,
}: {
  titulo: string;
  ano: number;
  selecionado: { ano: number; mes: number } | null;
  href: (mes: number) => string;
  hrefDoAno: (ano: number) => string;
  hrefSemComparacao?: string | null;
}) {
  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</h2>
        <div className="flex items-center gap-0.5">
          <SetaDeAno href={hrefDoAno(ano - 1)} rotulo={`Ir para ${ano - 1}`} direcao="anterior" />
          <span className="min-w-[3rem] text-center text-[13px] font-medium tabular-nums text-ink">{ano}</span>
          <SetaDeAno href={hrefDoAno(ano + 1)} rotulo={`Ir para ${ano + 1}`} direcao="proximo" />
        </div>
      </div>

      {/*
        Mesma bandeja de pílulas dos modos do gráfico e do seletor do
        relatório: doze meses não cabem numa linha só, então a bandeja vira
        grade, mas cada opção continua sendo a mesma pílula do resto do produto.
      */}
      <div className="grid grid-cols-6 gap-1 rounded-2xl border border-line bg-panel-soft/60 p-1">
        {MESES_CURTOS.map((rotulo, indice) => {
          const mes = indice + 1;
          const ativo = selecionado?.ano === ano && selecionado.mes === mes;
          return (
            <Link
              key={rotulo}
              href={href(mes)}
              aria-current={ativo ? "page" : undefined}
              className={`focus-ring rounded-full px-2 py-1.5 text-center text-[12px] font-medium transition-all duration-200 ease-soft active:scale-95 ${
                ativo ? "bg-ink text-canvas shadow-subtle" : "text-ink-mute hover:text-ink"
              }`}
            >
              {rotulo}
            </Link>
          );
        })}
      </div>

      {hrefSemComparacao !== undefined && (
        <div className="mt-3">
          {hrefSemComparacao ? (
            <Link
              href={hrefSemComparacao}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-soft transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Remover comparação
            </Link>
          ) : (
            <p className="px-1 text-[12px] text-ink-mute">Escolha um mês para comparar com o período.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SetaDeAno({ href, rotulo, direcao }: { href: string; rotulo: string; direcao: "anterior" | "proximo" }) {
  return (
    <Link
      href={href}
      aria-label={rotulo}
      className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-mute transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-95"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        {direcao === "anterior" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </Link>
  );
}

const PLATAFORMAS: Record<string, string> = { GOOGLE: "Google Ads", META: "Meta Ads" };

function Tabela({
  campanhas,
  rotuloDaComparacao,
}: {
  campanhas: CampanhaComparada[];
  /** Null quando nenhum período de comparação foi escolhido. */
  rotuloDaComparacao: string | null;
}) {
  return (
    <div className="surface overflow-hidden">
      {/* A tabela é larga de propósito; quem rola é ela, nunca a página. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-mute">
              <th className="px-4 py-3 font-semibold">Campanha</th>
              <th className="px-4 py-3 text-right font-semibold">Investimento</th>
              <th className="px-4 py-3 text-right font-semibold">Leads</th>
              <th className="px-4 py-3 text-right font-semibold">Qualificados</th>
              <th className="px-4 py-3 text-right font-semibold">Vendas</th>
              <th className="px-4 py-3 text-right font-semibold">Receita</th>
              <th className="px-4 py-3 text-right font-semibold">Custo por lead</th>
              <th className="px-4 py-3 text-right font-semibold">Custo por venda</th>
              <th className="px-4 py-3 text-right font-semibold">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((linha) => (
              <Linha key={linha.externalId} linha={linha} rotuloDaComparacao={rotuloDaComparacao} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Linha({
  linha,
  rotuloDaComparacao,
}: {
  linha: CampanhaComparada;
  rotuloDaComparacao: string | null;
}) {
  // Uma campanha ausente do período escolhido continua na tabela: "não rodou"
  // é metade da explicação de uma queda, e some-la esconderia justamente isso.
  const ausente = linha.atual === null;
  const dados = linha.atual ?? linha.anterior!;
  const temComparacao = rotuloDaComparacao !== null;

  return (
    <tr className={`border-b border-line/60 last:border-0 ${ausente ? "opacity-55" : ""}`}>
      <td className="px-4 py-3 align-top">
        <p className="font-medium text-ink">{linha.nome}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-mute">
          {PLATAFORMAS[linha.plataforma] ?? linha.plataforma}
          {dados.ativo && (
            <>
              {" · "}
              {formataDia(dados.ativo.de)} a {formataDia(dados.ativo.ate)} ({dados.ativo.dias}{" "}
              {dados.ativo.dias === 1 ? "dia ativo" : "dias ativos"})
            </>
          )}
        </p>
        {/*
          Sem dizer de onde vêm, os números desta linha seriam lidos como se
          fossem do período escolhido, que é justamente o período em que a
          campanha não existiu.
        */}
        {ausente && (
          <p className="mt-1 text-[11.5px] text-ink-mute">
            Não rodou no período escolhido. Os números ao lado são de {rotuloDaComparacao}.
          </p>
        )}
      </td>

      <Numero valor={formatCentsAsBRL(dados.gastoCentavos)} variacao={temComparacao ? linha.variacao?.gastoCentavos : undefined} />
      <Numero valor={String(dados.leads)} variacao={temComparacao ? linha.variacao?.leads : undefined} />
      <Numero valor={String(dados.qualificados)} />
      <Numero valor={String(dados.vendas)} variacao={temComparacao ? linha.variacao?.vendas : undefined} />
      <Numero
        valor={formatCentsAsBRL(dados.receitaCentavos)}
        variacao={temComparacao ? linha.variacao?.receitaCentavos : undefined}
        nota={
          dados.vendasSemValor > 0
            ? `${dados.vendasSemValor} ${dados.vendasSemValor === 1 ? "venda" : "vendas"} sem valor registrado`
            : undefined
        }
      />
      {/*
        Traço não: um hífen numa célula vazia é lido como "zero" ou como ruído.
        Dizer que a conta não pôde ser feita é a informação que falta.
      */}
      <Numero valor={dados.custoPorLeadCentavos === null ? "Sem base" : formatCentsAsBRL(dados.custoPorLeadCentavos)} />
      <Numero valor={dados.custoPorVendaCentavos === null ? "Sem base" : formatCentsAsBRL(dados.custoPorVendaCentavos)} />
      <Numero valor={dados.roas === null ? "Sem base" : `${dados.roas.toFixed(2).replace(".", ",")}x`} />
    </tr>
  );
}

function Numero({
  valor,
  variacao,
  nota,
}: {
  valor: string;
  variacao?: { delta: number | null; anterior: number };
  nota?: string;
}) {
  return (
    <td className="px-4 py-3 text-right align-top tabular-nums text-ink">
      <span className="block">{valor}</span>
      {variacao && (
        <span className="mt-0.5 block">
          <Delta delta={variacao.delta} />
        </span>
      )}
      {nota && <span className="mt-0.5 block text-[11px] font-normal text-ink-mute">{nota}</span>}
    </td>
  );
}
