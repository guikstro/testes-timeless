import Link from "next/link";
import type { Overview } from "./tipos";
import { plural } from "./tipos";

/**
 * A primeira tela do dashboard, para quem não entende de anúncio nem de funil.
 *
 * Pouca coisa de primeira, o resto aos poucos. O número grande responde "o
 * mês está bom?", os três pequenos dão o contexto, e a faixa escura diz o que
 * fazer agora. Jornada, origem e anúncios ficam em "Ver mais", e o relatório
 * completo (as abas de antes) fica um clique adiante.
 */
export function ResumoSimples({
  overview,
  gastoCentavos,
  dias,
  relatorioCompleto,
  esperando,
  anuncios,
}: {
  overview: Overview;
  /** Gasto em anúncios no período; null quando não há conta de anúncios ligada. */
  gastoCentavos: number | null;
  dias: number;
  relatorioCompleto: string;
  /** Quem espera resposta há mais de 30 minutos; null quando a contagem não carregou. */
  esperando: { quantos: number; mais: boolean } | null;
  /** O que os anúncios fizeram no período; null quando não há conta de anúncios ligada. */
  anuncios: { campanhas: number; cliques: number | null; gastoCentavos: number } | null;
}) {
  const { totals, comparacao, atendimento, byOrigin } = overview;
  const clientes = totals.clientes;
  const anterior = comparacao.clientes.anterior;
  const diferenca = clientes - anterior;
  const custoPorContato = gastoCentavos !== null && gastoCentavos > 0 && totals.leads > 0 ? gastoCentavos / totals.leads : null;
  const periodo = dias === 1 ? "hoje" : dias === 30 ? "este mês" : `nos últimos ${dias} dias`;

  return (
    <div className="mx-auto max-w-3xl">
      <section className="py-6 text-center sm:py-10">
        {/*
          O número grande é o que responde "as campanhas estão trazendo gente?".
          Enquanto ninguém virou cliente, um zero gigante só desanima e não
          informa: nesse caso o destaque é quem chamou, e os clientes ficam na
          linha de baixo, onde o zero é só mais um dado.
        */}
        <p className="font-display text-[5.5rem] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[7rem]">
          {clientes > 0 ? clientes : totals.leads}
        </p>
        <p className="mt-3 text-lg text-ink">
          {clientes > 0
            ? `${clientes === 1 ? "novo cliente" : "novos clientes"} ${periodo}`
            : `${totals.leads === 1 ? "pessoa chamou" : "pessoas chamaram"} no WhatsApp ${periodo}`}
        </p>
        <p className="mt-1 text-apoio text-ink-mute">
          {clientes > 0
            ? "Contamos quem marcou reunião ou fechou contrato."
            : "Ainda sem cliente fechado. Contamos como cliente quem marcou reunião ou fechou contrato."}
        </p>
        <Variacao
          diferenca={clientes > 0 ? diferenca : totals.leads - comparacao.leads.anterior}
          anterior={clientes > 0 ? anterior : comparacao.leads.anterior}
          referencia={dias === 1 ? "ontem" : "no período anterior"}
          unidade={clientes > 0 ? "" : " contato"}
        />
      </section>

      <section className="mx-auto grid max-w-2xl grid-cols-2 items-stretch gap-y-5 divide-line text-center sm:grid-cols-4 sm:divide-x">
        {anuncios && anuncios.cliques !== null ? <Pequeno valor={String(anuncios.cliques)} rotulo="cliques nos anúncios" /> : null}
        <Pequeno valor={String(totals.emConversa)} rotulo="em conversa" />
        {custoPorContato !== null ? (
          <Pequeno valor={reais(Math.round(custoPorContato))} rotulo="por contato" />
        ) : gastoCentavos ? (
          <Pequeno valor={reais(gastoCentavos)} rotulo="investidos" />
        ) : null}
        <Pequeno valor={String(clientes)} rotulo={clientes === 1 ? "cliente" : "clientes"} />
      </section>

      <FaixaDeAnuncios anuncios={anuncios} contatos={totals.leads} />

      {esperando ? <FaixaDeEspera aguardando={esperando.quantos} mais={esperando.mais} /> : null}

      <details className="group mt-8">
        <summary className="focus-ring mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full border border-line bg-panel px-4 py-2 text-corpo font-medium text-ink-soft transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Ver mais</span>
          <span className="hidden group-open:inline">Ver menos</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>

        <div className="mt-8 space-y-4">
          <Jornada
            etapas={[
              { rotulo: "chamaram", valor: totals.leads },
              { rotulo: "foram atendidas", valor: atendimento.respondidos },
              { rotulo: "tinham um caso", valor: totals.qualified },
              { rotulo: "viraram clientes", valor: clientes },
            ]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <DeOndeVem origens={byOrigin} />
            <Anuncios gastoCentavos={gastoCentavos} contatos={totals.leads} clientes={clientes} />
          </div>

          <div className="pt-4 text-center">
            <Link href={relatorioCompleto} className="focus-ring rounded text-corpo font-medium text-accent hover:underline">
              Abrir relatório completo
            </Link>
            <p className="mt-1 text-apoio text-ink-mute">Funil detalhado, horários, atendimento e vendas</p>
          </div>
        </div>
      </details>
    </div>
  );
}

function Variacao({ diferenca, anterior, referencia, unidade = "" }: { diferenca: number; anterior: number; referencia: string; unidade?: string }) {
  if (anterior === 0 && diferenca === 0) return null;
  const texto =
    diferenca === 0
      ? `o mesmo que ${referencia}`
      : `${Math.abs(diferenca)}${unidade} a ${diferenca > 0 ? "mais" : "menos"} que ${referencia}`;
  return (
    <p className={`mt-3 text-corpo font-medium ${diferenca > 0 ? "text-success" : diferenca < 0 ? "text-danger" : "text-ink-mute"}`}>
      {diferenca > 0 ? "↗ " : diferenca < 0 ? "↘ " : ""}
      {texto}
    </p>
  );
}

function Pequeno({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex-1 px-4 sm:px-8">
      <p className="font-display text-3xl font-semibold tracking-tight text-ink">{valor}</p>
      <p className="mt-0.5 text-corpo text-ink-mute">{rotulo}</p>
    </div>
  );
}

/**
 * O que os anúncios estão fazendo, em duas frases quando algo está errado.
 *
 * Sem isto, campanha parada e campanha ruim ficam iguais na tela: um zero.
 * Só aparece quando há o que dizer; com tudo andando, não ocupa lugar.
 */
function FaixaDeAnuncios({ anuncios, contatos }: { anuncios: { campanhas: number; cliques: number | null; gastoCentavos: number } | null; contatos: number }) {
  if (!anuncios || anuncios.campanhas === 0) return null;

  let titulo: string | null = null;
  let detalhe = "";
  if (anuncios.gastoCentavos === 0) {
    titulo = "Os anúncios não gastaram nada neste período";
    detalhe = "Confira o saldo da conta e se os anúncios estão aprovados no Google Ads.";
  } else if ((anuncios.cliques ?? 0) >= 10 && contatos === 0) {
    titulo = `${anuncios.cliques} cliques e nenhum contato no WhatsApp`;
    detalhe = "Vale testar o botão da página e conferir se o WhatsApp está conectado.";
  }
  if (!titulo) return null;

  return (
    <Link
      href="/integrations"
      className="focus-ring mt-8 flex items-start gap-3 rounded-2xl border border-warning-line bg-warning-soft px-5 py-4 transition-opacity hover:opacity-95"
    >
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-warning" aria-hidden />
      <p className="flex-1 text-destaque text-ink">
        <span className="font-semibold">{titulo}.</span> <span className="text-ink-soft">{detalhe}</span>
      </p>
      <span className="shrink-0 text-corpo font-medium text-accent">Ver</span>
    </Link>
  );
}

/** O que precisa de ação agora. Escura de propósito: é a única coisa da tela que pede para alguém se mexer. */
function FaixaDeEspera({ aguardando, mais }: { aguardando: number; mais: boolean }) {
  if (aguardando === 0) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-success-line bg-success-soft px-5 py-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success" aria-hidden />
        <p className="text-destaque text-ink">Ninguém esperando resposta há mais de 30 minutos.</p>
      </div>
    );
  }
  return (
    <Link
      href="/conversas?filtro=awaiting"
      className="focus-ring mt-8 flex items-center gap-3 rounded-2xl bg-ink px-5 py-4 text-canvas transition-opacity hover:opacity-95"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning-line" aria-hidden />
      <p className="flex-1 text-destaque">
        <span className="font-semibold">
          {mais ? "Mais de " : ""}
          {plural(aguardando, "pessoa", "pessoas")}
        </span>{" "}
        {aguardando === 1 && !mais ? "está esperando" : "estão esperando"} resposta há mais de 30 minutos
      </p>
      <span className="text-corpo font-medium text-accent">Responder</span>
    </Link>
  );
}

function Jornada({ etapas }: { etapas: { rotulo: string; valor: number }[] }) {
  const total = etapas[0]?.valor ?? 0;
  // A maior perda entre duas etapas vizinhas: é onde dá para ganhar mais.
  let perda: { de: string; quantos: number } | null = null;
  for (let i = 1; i < etapas.length; i++) {
    const quantos = etapas[i - 1].valor - etapas[i].valor;
    if (quantos > 0 && (!perda || quantos > perda.quantos)) perda = { de: etapas[i - 1].rotulo, quantos };
  }

  return (
    <section className="surface p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">A jornada até virar cliente</h2>
      <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        {etapas.map((etapa, i) => {
          const ultima = i === etapas.length - 1;
          const parte = total > 0 ? etapa.valor / total : 0;
          return (
            <li key={etapa.rotulo}>
              <p className={`font-display text-2xl font-semibold tracking-tight ${ultima ? "text-accent" : "text-ink"}`}>
                {etapa.valor}
              </p>
              <p className="text-apoio text-ink-mute">{etapa.rotulo}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/10">
                <div
                  className={`h-full rounded-full ${ultima ? "bg-accent" : "bg-accent/45"}`}
                  style={{ width: `${Math.max(parte * 100, etapa.valor > 0 ? 3 : 0)}%` }}
                />
              </div>
              <p className="mt-1 text-rotulo tabular-nums text-ink-mute">{total > 0 ? `${Math.round(parte * 100)}%` : "0%"}</p>
            </li>
          );
        })}
      </ol>
      {perda ? (
        <p className="mt-3 text-corpo text-ink-soft">
          A maior perda é depois de <span className="font-medium text-ink">“{perda.de}”</span>:{" "}
          {plural(perda.quantos, "pessoa não seguiu", "pessoas não seguiram")}. É aí que dá para ganhar mais.
        </p>
      ) : null}
    </section>
  );
}

/** Nomes que qualquer pessoa entende, no lugar dos rótulos técnicos da atribuição. */
function nomeDaOrigem(chave: string, rotulo: string): string {
  if (chave === "meta_ctwa") return "Anúncio no Facebook/Instagram";
  if (chave === "unknown") return "Sem origem identificada";
  if (chave === "link:sem-nome") return "Link rastreável";
  return rotulo;
}

function DeOndeVem({ origens }: { origens: Overview["byOrigin"] }) {
  const linhas = origens.slice(0, 4);
  return (
    <section className="surface p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">De onde vêm</h2>
      {linhas.length === 0 ? (
        <p className="mt-3 text-corpo text-ink-mute">Nenhum contato no período.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {linhas.map((origem) => (
            <li key={origem.key} className={`flex items-baseline justify-between gap-3 text-corpo ${origem.key === "unknown" ? "text-ink-mute" : "text-ink"}`}>
              <span className="truncate">{nomeDaOrigem(origem.key, origem.label)}</span>
              <span className="shrink-0 tabular-nums">
                {origem.leads}, <span className={origem.clientes > 0 ? "text-accent" : ""}>{plural(origem.clientes, "cliente", "clientes")}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Anuncios({ gastoCentavos, contatos, clientes }: { gastoCentavos: number | null; contatos: number; clientes: number }) {
  return (
    <section className="surface p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Anúncios</h2>
      {gastoCentavos === null || gastoCentavos === 0 ? (
        <p className="mt-3 text-corpo text-ink-mute">
          Sem gasto em anúncios no período, ou a conta de anúncios não está conectada.
        </p>
      ) : (
        <>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{reais(gastoCentavos)}</p>
          <p className="text-apoio text-ink-mute">investidos no período</p>
          <p className="mt-3 text-corpo text-ink-soft">
            {contatos > 0 ? <>Cada contato custou <span className="font-medium text-ink">{reais(Math.round(gastoCentavos / contatos))}</span>. </> : null}
            {clientes > 0 ? <>Cada cliente, <span className="font-medium text-ink">{reais(Math.round(gastoCentavos / clientes))}</span>.</> : null}
          </p>
        </>
      )}
    </section>
  );
}

/** Reais sem centavos: numa tela de resumo, "R$ 1.200" lê mais rápido que "R$ 1.200,00". */
function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(centavos / 100);
}
