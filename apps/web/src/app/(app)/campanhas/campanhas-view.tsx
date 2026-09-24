import Link from "next/link";
import { AvisoDeMedicao } from "@/components/aviso-de-medicao";
import { Badge } from "@/components/ui/badge";
import { Delta } from "@/components/ui/delta";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { formatCentsAsBRL } from "@/lib/currency";
import { Medicao } from "@/lib/medicao-de-leads";
import {
  formataDia,
  Intervalo,
  intervaloDoMes,
  MESES_CURTOS,
  mesAnterior,
  mesDoIntervalo,
  rotuloDoIntervalo,
} from "@/lib/periodo";
import { CampanhaComparada, DesempenhoDeCampanha, DesempenhoDeCampanhas } from "./tipos";

/**
 * Separado da página pelo mesmo motivo da tela de relatório: a página busca no
 * servidor, esta vista só desenha, e assim a apresentação pode ser conferida
 * sem depender de dados reais.
 *
 * A tela responde uma pergunta só: de cada campanha, quanto saiu e quanto
 * voltou. Por isso a ordem das colunas segue o caminho do dinheiro, do gasto
 * à conversa que a Meta abriu, ao lead que chegou aqui, à venda.
 */
export function CampanhasView({
  dados,
  medicao,
  desdeDoWhatsApp,
}: {
  dados: DesempenhoDeCampanhas;
  medicao: Medicao;
  desdeDoWhatsApp: string | null;
}) {
  const { periodo, comparacao, campanhas, semCampanha, totais } = dados;
  const medido = medicao === "medido";

  // Os totais do período de comparação saem das próprias linhas: a API já
  // devolve os dois lados de cada campanha, e somá-los aqui evita uma segunda
  // rota que diria a mesma coisa.
  const anteriores = comparacao
    ? campanhas.reduce(
        (soma, linha) => ({
          gastoCentavos: soma.gastoCentavos + (linha.anterior?.gastoCentavos ?? 0),
          leads: soma.leads + (linha.anterior?.leads ?? 0),
          vendas: soma.vendas + (linha.anterior?.vendas ?? 0),
        }),
        { gastoCentavos: 0, leads: 0, vendas: 0 },
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

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Campanhas</h1>
          <p className="mt-1 max-w-2xl text-corpo text-ink-mute">
            Quanto cada campanha custou, quantas conversas a Meta diz que ela abriu, e quantas viraram lead e venda
            aqui.
          </p>
        </div>
        <SeletorDePeriodo periodo={periodo} comparacao={comparacao} />
      </header>

      <AvisoDeMedicao medicao={medicao} desde={desdeDoWhatsApp} conversasNaPlataforma={totais.conversasNaPlataforma} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Resumo
          titulo="Investimento"
          valor={formatCentsAsBRL(totais.gastoCentavos)}
          atual={totais.gastoCentavos}
          anterior={anteriores?.gastoCentavos}
        />
        <Resumo
          titulo="Conversas na Meta"
          valor={totais.conversasNaPlataforma === null ? "Sem dado" : String(totais.conversasNaPlataforma)}
          nota="O que o Gerenciador de Anúncios conta"
        />
        <Resumo
          titulo="Leads aqui"
          valor={medido ? String(totais.leads) : "Sem medida"}
          atual={medido ? totais.leads : undefined}
          anterior={medido ? anteriores?.leads : undefined}
          apagado={!medido}
        />
        <Resumo
          titulo="Vendas"
          valor={medido ? String(totais.vendas) : "Sem medida"}
          atual={medido ? totais.vendas : undefined}
          anterior={medido ? anteriores?.vendas : undefined}
          apagado={!medido}
        />
        <Resumo
          titulo="Retorno"
          valor={medido ? retorno(totais.receitaCentavos, totais.gastoCentavos, totais.vendas) : "Sem medida"}
          nota={medido && totais.gastoCentavos > 0 ? "Receita dividida pelo investimento" : undefined}
          apagado={!medido}
        />
      </div>

      {campanhas.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-sm text-ink-soft">Nenhuma campanha com gasto ou lead em {rotuloDoIntervalo(periodo)}.</p>
          <p className="mt-1.5 text-apoio text-ink-mute">
            Conecte a Meta em Integrações, ou lance o gasto por CSV ou à mão, para as campanhas aparecerem aqui.
          </p>
        </div>
      ) : (
        <Tabela
          campanhas={campanhas}
          medido={medido}
          rotuloDaComparacao={comparacao ? rotuloDoIntervalo(comparacao) : null}
        />
      )}

      {/*
        As definições ficam ao pé da tabela, uma vez só, em vez de repetidas em
        cada cabeçalho: é a primeira coisa que alguém procura quando dois
        números parecidos não batem.
      */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 text-apoio leading-relaxed text-ink-mute md:grid-cols-3">
        <div>
          <dt className="font-semibold text-ink-soft">Conversas na Meta</dt>
          <dd>Quantas pessoas a Meta diz que começaram uma conversa no WhatsApp a partir do anúncio.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Leads aqui</dt>
          <dd>
            Quem mandou mensagem no WhatsApp conectado e foi ligado a esta campanha. Fica abaixo da Meta quando a
            conversa não chegou ao número conectado.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Retorno</dt>
          <dd>Receita das vendas dividida pelo investimento. 2,00x quer dizer que cada real voltou dobrado.</dd>
        </div>
      </dl>

      {/*
        A soma das linhas não fecha com o total de leads da organização, e uma
        tabela que não diz isso passa a impressão de que as campanhas respondem
        por tudo o que entra.
      */}
      {medido && semCampanha.atual > 0 ? (
        <p className="mt-4 text-apoio leading-relaxed text-ink-mute">
          Mais {semCampanha.atual} {semCampanha.atual === 1 ? "lead entrou" : "leads entraram"} no período sem campanha
          identificada, por mensagem direta ou por clique sem rastreio.{" "}
          {semCampanha.atual === 1 ? "Ele não entra" : "Eles não entram"} em nenhuma linha acima.
        </p>
      ) : null}

      {semIdDaPlataforma > 0 && (
        <p className="mt-2 text-apoio leading-relaxed text-ink-mute">
          {semIdDaPlataforma === 1 ? "Uma campanha aparece" : `${semIdDaPlataforma} campanhas aparecem`} com gasto e
          nenhum lead porque {semIdDaPlataforma === 1 ? "foi criada" : "foram criadas"} sem o id da plataforma. O lead
          é ligado à campanha pelo id que chega no clique, então preencha o id real do Google Ads ou do Meta ao criar a
          campanha, e use links de rastreio que carreguem esse id.
        </p>
      )}
    </div>
  );
}

/**
 * Retorno escrito, e não só a conta.
 *
 * "0,00x" com nenhuma venda é aritmeticamente certo e ninguém entende; dizer
 * que não houve venda é o mesmo fato em português.
 */
function retorno(receitaCentavos: number, gastoCentavos: number, vendas: number): string {
  if (gastoCentavos <= 0) return "Sem gasto";
  if (vendas === 0) return "Nenhuma venda";
  return `${(receitaCentavos / gastoCentavos).toFixed(2).replace(".", ",")}x`;
}

/**
 * O período numa linha só.
 *
 * Eram dois calendários de doze meses lado a lado, ocupando meia tela antes
 * do primeiro número. Quase toda consulta é "este mês" ou "o mês passado", e
 * quase toda comparação é contra o mês anterior ou o mesmo mês do ano
 * anterior: as setas e três opções cobrem isso sem grade nenhuma.
 */
function SeletorDePeriodo({ periodo, comparacao }: { periodo: Intervalo; comparacao: Intervalo | null }) {
  const mes = mesDoIntervalo(periodo) ?? {
    ano: Number(periodo.de.slice(0, 4)),
    mes: Number(periodo.de.slice(5, 7)),
  };
  const anterior = mesAnterior(mes.ano, mes.mes);
  const seguinte = mes.mes === 12 ? { ano: mes.ano + 1, mes: 1 } : { ano: mes.ano, mes: mes.mes + 1 };

  const mesPassado = intervaloDoMes(anterior.ano, anterior.mes);
  const anoPassado = intervaloDoMes(mes.ano - 1, mes.mes);

  function url(p: Intervalo, c: Intervalo | null) {
    const params = new URLSearchParams({ de: p.de, ate: p.ate });
    if (c) {
      params.set("compararDe", c.de);
      params.set("compararAte", c.ate);
    }
    return `/campanhas?${params.toString()}`;
  }

  // Ao trocar de mês a comparação acompanha: "contra o mês anterior" continua
  // querendo dizer o anterior ao novo, e não o anterior ao antigo.
  function comparacaoPara(novo: { ano: number; mes: number }): Intervalo | null {
    if (!comparacao) return null;
    if (igual(comparacao, anoPassado)) return intervaloDoMes(novo.ano - 1, novo.mes);
    const antesDoNovo = mesAnterior(novo.ano, novo.mes);
    return intervaloDoMes(antesDoNovo.ano, antesDoNovo.mes);
  }

  const ativo = !comparacao
    ? "nenhuma"
    : igual(comparacao, mesPassado)
      ? "mes"
      : igual(comparacao, anoPassado)
        ? "ano"
        : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="surface flex items-center gap-1 rounded-full p-1">
        <SetaDeMes href={url(intervaloDoMes(anterior.ano, anterior.mes), comparacaoPara(anterior))} direcao="anterior" />
        <span className="min-w-[10.5rem] px-2 text-center text-corpo font-medium text-ink">
          {rotuloDoIntervalo(periodo)}
        </span>
        <SetaDeMes href={url(intervaloDoMes(seguinte.ano, seguinte.mes), comparacaoPara(seguinte))} direcao="proximo" />
      </div>

      <GrupoDePilulas
        ativo={ativo}
        opcoes={[
          { chave: "nenhuma", rotulo: "Sem comparar", href: url(periodo, null) },
          { chave: "mes", rotulo: "Mês anterior", href: url(periodo, mesPassado) },
          { chave: "ano", rotulo: `${MESES_CURTOS[mes.mes - 1]} de ${mes.ano - 1}`, href: url(periodo, anoPassado) },
        ]}
      />
    </div>
  );
}

function igual(a: Intervalo, b: Intervalo): boolean {
  return a.de === b.de && a.ate === b.ate;
}

function SetaDeMes({ href, direcao }: { href: string; direcao: "anterior" | "proximo" }) {
  return (
    <Link
      href={href}
      aria-label={direcao === "anterior" ? "Mês anterior" : "Mês seguinte"}
      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-mute transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        {direcao === "anterior" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </Link>
  );
}

function Resumo({
  titulo,
  valor,
  atual,
  anterior,
  nota,
  apagado = false,
}: {
  titulo: string;
  valor: string;
  atual?: number;
  /** Ausente quando não há período de comparação escolhido. */
  anterior?: number;
  nota?: string;
  /** Sem medida: o valor é escrito, mas não pode parecer um número. */
  apagado?: boolean;
}) {
  const compara = anterior !== undefined && atual !== undefined;

  return (
    <div className="surface p-4">
      <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</p>
      <p
        className={`mt-1.5 font-display font-semibold tabular-nums ${
          apagado ? "text-lg text-ink-mute" : "text-xl text-ink"
        }`}
      >
        {valor}
      </p>
      {compara && (
        <div className="mt-1">
          <Delta delta={anterior === 0 ? null : (atual - anterior) / anterior} />
        </div>
      )}
      {nota && <p className="mt-1 text-rotulo text-ink-mute">{nota}</p>}
    </div>
  );
}

const PLATAFORMAS: Record<string, string> = { GOOGLE: "Google Ads", META: "Meta Ads" };

const STATUS: Record<string, { rotulo: string; tom: "success" | "neutral" }> = {
  ACTIVE: { rotulo: "Ativa", tom: "success" },
  PAUSED: { rotulo: "Pausada", tom: "neutral" },
  ARCHIVED: { rotulo: "Arquivada", tom: "neutral" },
  DELETED: { rotulo: "Excluída", tom: "neutral" },
};

function Tabela({
  campanhas,
  medido,
  rotuloDaComparacao,
}: {
  campanhas: CampanhaComparada[];
  medido: boolean;
  /** Null quando nenhum período de comparação foi escolhido. */
  rotuloDaComparacao: string | null;
}) {
  return (
    <div className="surface overflow-hidden">
      {/* A tabela é larga de propósito; quem rola é ela, nunca a página. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-corpo">
          <thead>
            <tr className="border-b border-line text-left text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
              <th className="px-4 py-3 font-semibold">Campanha</th>
              <th className="px-4 py-3 text-right font-semibold">Investimento</th>
              <th className="px-4 py-3 text-right font-semibold">Conversas na Meta</th>
              <th className="px-4 py-3 text-right font-semibold">Leads aqui</th>
              <th className="px-4 py-3 text-right font-semibold">Vendas</th>
              <th className="px-4 py-3 text-right font-semibold">Receita</th>
              <th className="px-4 py-3 text-right font-semibold">Custo por lead</th>
              <th className="px-4 py-3 text-right font-semibold">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((linha) => (
              <Linha key={linha.externalId} linha={linha} medido={medido} rotuloDaComparacao={rotuloDaComparacao} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Linha({
  linha,
  medido,
  rotuloDaComparacao,
}: {
  linha: CampanhaComparada;
  medido: boolean;
  rotuloDaComparacao: string | null;
}) {
  // Uma campanha ausente do período escolhido continua na tabela: "não rodou"
  // é metade da explicação de uma queda, e some-la esconderia justamente isso.
  const ausente = linha.atual === null;
  const dados = linha.atual ?? linha.anterior!;
  const temComparacao = rotuloDaComparacao !== null;
  const status = STATUS[linha.status];

  return (
    <tr className={`border-b border-line/60 last:border-0 ${ausente ? "opacity-55" : ""}`}>
      <td className="px-4 py-3.5 align-top">
        <p className="font-medium text-ink">{linha.nome}</p>
        {/*
          Status e data de criação logo abaixo do nome: a Meta aceita duas
          campanhas com o mesmo nome, e é comum duplicar uma para testar. Sem
          isto, as duas linhas pareciam a mesma campanha repetida.
        */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-rotulo text-ink-mute">
          {status ? (
            <Badge tone={status.tom} dot>
              {status.rotulo}
            </Badge>
          ) : null}
          <span>{PLATAFORMAS[linha.plataforma] ?? linha.plataforma}</span>
          {linha.criadaNaPlataformaEm ? <span>· criada em {formataDia(linha.criadaNaPlataformaEm)}</span> : null}
        </div>
        {dados.ativo && (
          <p className="mt-1 text-rotulo text-ink-mute">
            {dados.ativo.dias === 1
              ? `Gasto em 1 dia (${formataDia(dados.ativo.de)})`
              : `Gasto em ${dados.ativo.dias} dias, de ${formataDia(dados.ativo.de)} a ${formataDia(dados.ativo.ate)}`}
          </p>
        )}
        {/*
          Sem dizer de onde vêm, os números desta linha seriam lidos como se
          fossem do período escolhido, que é justamente o período em que a
          campanha não existiu.
        */}
        {ausente && (
          <p className="mt-1 text-rotulo text-ink-mute">
            Não rodou no período escolhido. Os números ao lado são de {rotuloDaComparacao}.
          </p>
        )}
      </td>

      <Numero
        valor={formatCentsAsBRL(dados.gastoCentavos)}
        variacao={temComparacao ? linha.variacao?.gastoCentavos : undefined}
      />
      <Numero
        valor={dados.conversasNaPlataforma === null ? "Sem dado" : String(dados.conversasNaPlataforma)}
        apagado={dados.conversasNaPlataforma === null}
        nota={
          dados.conversasNaPlataforma !== null && !dados.conversasCompletas
            ? "no mínimo, falta dado de alguns dias"
            : undefined
        }
      />
      {medido ? <ColunasMedidas dados={dados} linha={linha} temComparacao={temComparacao} /> : <ColunasSemMedida />}
    </tr>
  );
}

function ColunasMedidas({
  dados,
  linha,
  temComparacao,
}: {
  dados: DesempenhoDeCampanha;
  linha: CampanhaComparada;
  temComparacao: boolean;
}) {
  return (
    <>
      <Numero
        valor={String(dados.leads)}
        variacao={temComparacao ? linha.variacao?.leads : undefined}
        nota={
          dados.qualificados > 0
            ? `${dados.qualificados} ${dados.qualificados === 1 ? "qualificado" : "qualificados"}`
            : undefined
        }
      />
      <Numero
        valor={String(dados.vendas)}
        variacao={temComparacao ? linha.variacao?.vendas : undefined}
        nota={dados.custoPorVendaCentavos !== null ? `${formatCentsAsBRL(dados.custoPorVendaCentavos)} cada` : undefined}
      />
      <Numero
        valor={formatCentsAsBRL(dados.receitaCentavos)}
        variacao={temComparacao ? linha.variacao?.receitaCentavos : undefined}
        nota={
          dados.vendasSemValor > 0
            ? `${dados.vendasSemValor} ${dados.vendasSemValor === 1 ? "venda" : "vendas"} sem valor registrado`
            : undefined
        }
      />
      <Numero
        valor={
          dados.custoPorLeadCentavos !== null
            ? formatCentsAsBRL(dados.custoPorLeadCentavos)
            : dados.gastoCentavos > 0
              ? "Nenhum lead"
              : "Sem gasto"
        }
        apagado={dados.custoPorLeadCentavos === null}
      />
      <Numero
        valor={retorno(dados.receitaCentavos, dados.gastoCentavos, dados.vendas)}
        apagado={dados.gastoCentavos <= 0 || dados.vendas === 0}
      />
    </>
  );
}

/**
 * As cinco colunas que dependem do WhatsApp, quando não há medida.
 *
 * Uma célula só, atravessando as cinco: repetir "sem medida" cinco vezes por
 * linha enchia a tabela de ruído, e o que precisa ser dito é uma frase, uma
 * vez. Escrita por extenso, e não com traço, porque um hífen numa célula é
 * lido como zero.
 */
function ColunasSemMedida() {
  return (
    <td colSpan={5} className="px-4 py-3.5 text-center align-top text-apoio text-ink-mute">
      Sem medida até o WhatsApp estar recebendo
    </td>
  );
}

function Numero({
  valor,
  variacao,
  nota,
  apagado = false,
}: {
  valor: string;
  variacao?: { delta: number | null; anterior: number };
  nota?: string;
  apagado?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3.5 text-right align-top tabular-nums ${
        apagado ? "text-apoio text-ink-mute" : "text-ink"
      }`}
    >
      <span className="block">{valor}</span>
      {variacao && (
        <span className="mt-0.5 block">
          <Delta delta={variacao.delta} />
        </span>
      )}
      {nota && <span className="mt-0.5 block whitespace-normal text-rotulo font-normal text-ink-mute">{nota}</span>}
    </td>
  );
}
