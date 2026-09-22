import Link from "next/link";
import { Identificacao as Dados } from "./tipos";

/**
 * Até onde a identificação chega, e o que fica de fora.
 *
 * Este bloco existe porque a tabela por anúncio, sozinha, engana de um jeito
 * específico: o lead que não pôde ser ligado a um anúncio não aparece em linha
 * nenhuma. Sem dizer quantos são esses, o cliente lê "estes anúncios trouxeram
 * doze leads" quando a verdade é "doze dos quarenta puderam ser ligados a um
 * anúncio, e dos outros vinte e oito não se sabe".
 *
 * A cobertura vem antes dos métodos porque é a pergunta de quem está lendo:
 * quanto da tela acima é confiável. Os métodos explicam o porquê, e explicação
 * é o segundo passo.
 */
export function Identificacao({ dados }: { dados: Dados }) {
  if (dados.total === 0) {
    return null;
  }

  const cobertura = dados.coberturaPorCento ?? 0;

  return (
    <section className="surface p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          De onde vieram os leads
        </h2>
        <p className="text-corpo text-ink-mute">
          <span className="font-medium text-ink">
            {dados.atePeloAnuncio} de {dados.total}
          </span>{" "}
          aparecem na tabela acima
        </p>
      </div>

      {/*
        A barra é a mesma conta da cobertura, desenhada.

        Verde é o que a tabela mostra; o resto é o que ela não alcança. Somar
        tudo numa barra só, sem separar, faria parecer que o período foi bem
        medido quando três quartos dele são desconhecidos.
      */}
      <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-panel-soft" role="presentation">
        <div className="h-full bg-accent transition-[width] duration-500 ease-soft" style={{ width: `${cobertura}%` }} />
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Linha
          rotulo="Anúncio identificado"
          valor={dados.atePeloAnuncio}
          total={dados.total}
          detalhe="A Meta informou o criativo, ou o link rastreado carregava o id dele."
        />
        {dados.semNivelDeAnuncio > 0 ? (
          <Linha
            rotulo="Origem sem anúncio"
            valor={dados.semNivelDeAnuncio}
            total={dados.total}
            detalhe="Veio de campanha rastreada, mas a evidência não chegou ao nível do criativo."
          />
        ) : null}
        {dados.deAnuncioDesconhecido > 0 ? (
          <Linha
            rotulo="Anúncio fora da lista"
            valor={dados.deAnuncioDesconhecido}
            total={dados.total}
            detalhe="Em geral é criativo apagado da conta: o gasto histórico continua, o anúncio não existe mais."
          />
        ) : null}
        {dados.semOrigem > 0 ? (
          <Linha
            rotulo="Sem origem"
            valor={dados.semOrigem}
            total={dados.total}
            detalhe="Nenhuma evidência na primeira mensagem. O produto não chuta uma campanha."
          />
        ) : null}
      </dl>

      {/*
        Os dois métodos provam coisas diferentes, e por isso não viram um
        "atribuído" só: o primeiro é a Meta declarando a origem, o segundo é
        o nosso token casado de volta com o clique que o gerou.
      */}
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-line/70 pt-4 text-apoio text-ink-mute">
        <span>
          Clique para o WhatsApp:{" "}
          <span className="font-medium tabular-nums text-ink">{dados.porMetodo.CTWA_REFERRAL}</span>
        </span>
        <span>
          Link rastreado:{" "}
          <span className="font-medium tabular-nums text-ink">{dados.porMetodo.TRACKING_LINK}</span>
        </span>
        <span>
          Sem evidência:{" "}
          <span className="font-medium tabular-nums text-ink">{dados.porMetodo.UNKNOWN}</span>
        </span>
      </div>

      {dados.semOrigem > dados.atePeloAnuncio ? (
        <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-apoio leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          A maior parte dos leads chegou sem origem, então o custo por lead da tabela acima está
          calculado sobre a minoria identificada e sai mais alto que o real.{" "}
          <Link href="/links" className="link font-medium">
            Links rastreados
          </Link>{" "}
          e anúncios de clique para o WhatsApp são os dois caminhos que fecham essa lacuna.
        </p>
      ) : null}
    </section>
  );
}

function Linha({
  rotulo,
  valor,
  total,
  detalhe,
}: {
  rotulo: string;
  valor: number;
  total: number;
  detalhe: string;
}) {
  return (
    <div>
      <dt className="flex items-baseline justify-between gap-3">
        <span className="text-corpo font-medium text-ink">{rotulo}</span>
        <span className="font-display text-destaque font-semibold tabular-nums text-ink">
          {valor}
          <span className="ml-1.5 font-sans text-rotulo font-normal text-ink-mute">
            {Math.round((valor / total) * 100)}%
          </span>
        </span>
      </dt>
      <dd className="mt-0.5 max-w-prose text-apoio leading-relaxed text-ink-mute">{detalhe}</dd>
    </div>
  );
}
