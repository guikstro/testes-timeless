import Link from "next/link";
import { formatCentsAsBRL } from "@/lib/currency";
import { SaudeDaConta } from "./tipos";

/**
 * A conta de anúncios pelo que a Meta diz dela.
 *
 * Esta tira existe porque a verba combinada e o dinheiro do outro lado são
 * duas coisas diferentes, e é possível ter cinco mil combinados com a conta
 * suspensa, ou verba de sobra com o cartão recusado ontem. Nenhuma das duas
 * aparece no relatório de gasto: nas duas o gasto simplesmente para, e um
 * gasto que para parece um mês fraco.
 *
 * Fica acima do painel da verba de propósito. Quando a conta está parada,
 * nenhum número abaixo dela quer dizer o que parece querer.
 */
export function SaudeDaContaMeta({ saude }: { saude: SaudeDaConta | null }) {
  if (!saude) return null;

  // Nunca sincronizada: a tira não tem o que afirmar, e afirmar "ok" seria
  // pior que ficar quieta.
  if (!saude.lidoEm) {
    return (
      <p className="rounded-xl border border-line bg-panel-soft/60 px-4 py-3 text-apoio text-ink-mute">
        A saúde da conta de anúncios ainda não foi lida. Ela chega na próxima sincronização com a Meta.
      </p>
    );
  }

  const tom = TONS[saude.gravidade];

  return (
    <section className={`rounded-2xl border px-5 py-4 ${tom.caixa}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="flex items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${tom.ponto}`} aria-hidden />
          <span className="text-corpo font-medium">
            {saude.nome ?? "Conta de anúncios"}
            {saude.status ? `: ${saude.status.rotulo}` : ""}
          </span>
        </p>

        <dl className="flex flex-wrap gap-x-7 gap-y-2 text-apoio">
          {/*
            Saldo e teto não são a mesma coisa e nunca aparecem juntos por
            acaso: saldo é conta pré-paga, teto é conta com limite. Mostrar o
            que a conta não tem seria inventar uma categoria.
          */}
          {saude.saldoCentavos !== null ? (
            <Dado rotulo="Saldo na Meta" valor={formatCentsAsBRL(saude.saldoCentavos)} />
          ) : null}

          {saude.restanteDoTetoCentavos !== null ? (
            <Dado
              rotulo="Falta para o teto"
              valor={formatCentsAsBRL(saude.restanteDoTetoCentavos)}
              nota={
                saude.tetoConsumidoPorCento !== null
                  ? `${saude.tetoConsumidoPorCento.toLocaleString("pt-BR")}% usado`
                  : undefined
              }
            />
          ) : (
            <Dado rotulo="Teto de gasto" valor="Sem teto definido" />
          )}

          <Dado rotulo="Lido" valor={quando(saude.lidoEm)} />
        </dl>
      </div>

      {saude.status?.oQueFazer ? <p className="mt-2.5 text-apoio leading-relaxed">{saude.status.oQueFazer}</p> : null}

      {/*
        O acumulado aparece com o nome certo e só junto do teto.

        `amount_spent` não é o gasto do período: é o acumulado contra o teto, e
        zera quando o teto é redefinido. Chamá-lo de gasto daria um número que
        não bate com nenhum outro desta tela.
      */}
      {saude.acumuladoCentavos !== null && saude.tetoCentavos !== null ? (
        <p className="mt-2 text-rotulo leading-relaxed opacity-80">
          {formatCentsAsBRL(saude.acumuladoCentavos)} acumulados contra um teto de{" "}
          {formatCentsAsBRL(saude.tetoCentavos)}. Este acumulado é da conta desde o último teto, não o gasto do
          período mostrado abaixo.
        </p>
      ) : null}

      {saude.gravidade === "parada" ? (
        <p className="mt-2.5 text-apoio">
          <Link href="/integrations/meta" className="font-medium underline underline-offset-2">
            Ver a conexão com a Meta
          </Link>
        </p>
      ) : null}
    </section>
  );
}

const TONS = {
  ok: {
    caixa: "border-line bg-panel-soft/60 text-ink-soft",
    ponto: "bg-accent",
  },
  atencao: {
    caixa: "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
    ponto: "bg-amber-500",
  },
  parada: {
    caixa: "border-red-300/60 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
    ponto: "bg-red-500",
  },
} as const;

function Dado({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-rotulo font-semibold uppercase tracking-[0.1em] opacity-70">{rotulo}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">
        {valor}
        {nota ? <span className="ml-1.5 font-normal opacity-70">{nota}</span> : null}
      </dd>
    </div>
  );
}

/** Horas quando é de hoje, data quando é mais velho: a idade é a informação. */
function quando(iso: string): string {
  const lido = new Date(iso);
  const horas = (Date.now() - lido.getTime()) / 3_600_000;

  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${Math.round(horas)} ${Math.round(horas) === 1 ? "hora" : "horas"}`;

  return lido.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
