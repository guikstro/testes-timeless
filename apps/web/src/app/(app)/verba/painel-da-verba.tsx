import { formatCentsAsBRL } from "@/lib/currency";
import { formataDia } from "@/lib/periodo";
import { SituacaoDaVerba } from "./tipos";
import { FormularioDaVerba } from "./formulario-da-verba";

/**
 * A verba: quanto entrou, quanto saiu, quanto sobra e até quando dá.
 *
 * Verba não declarada e verba zerada são coisas diferentes, e a tela trata as
 * duas de forma diferente: sem verba, o painel convida a declarar uma em vez
 * de mostrar zero, que seria um número inventado.
 */
export function PainelDaVerba({
  situacao,
  gastoDeHoje,
}: {
  situacao: SituacaoDaVerba | null;
  /** Quanto saiu hoje. Null quando o dia ainda não foi sincronizado. */
  gastoDeHoje: number | null;
}) {
  if (!situacao) {
    return (
      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Declare a verba deste período
        </h2>
        <p className="mt-2 max-w-prose text-corpo text-ink-mute">
          Com ela, esta tela passa a mostrar quanto já foi, quanto sobra e em que dia o saldo
          acaba no ritmo atual. Sem ela, só dá para mostrar o que foi gasto.
        </p>
        <div className="mt-6 max-w-xl">
          <FormularioDaVerba />
        </div>
      </section>
    );
  }

  const estourou = situacao.saldoCentavos < 0;
  const consumido = situacao.consumidoPorCento ?? 0;
  const acelerado =
    situacao.ritmoDiarioCentavos !== null &&
    situacao.ritmoIdealCentavos !== null &&
    situacao.ritmoDiarioCentavos > situacao.ritmoIdealCentavos;

  return (
    <section className="surface p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
            Saldo da verba
          </p>
          <p
            className={`mt-1 font-display text-[clamp(2rem,5vw,2.75rem)] font-semibold tabular-nums tracking-tight ${
              estourou ? "text-red-600 dark:text-red-400" : "text-ink"
            }`}
          >
            {formatCentsAsBRL(situacao.saldoCentavos)}
          </p>
          <p className="mt-1 text-corpo text-ink-mute">
            de {formatCentsAsBRL(situacao.amountCents)} · {formataDia(situacao.de)}
            {situacao.ate ? ` a ${formataDia(situacao.ate)}` : " em diante"}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Apoio rotulo="Já investido" valor={formatCentsAsBRL(situacao.gastoCentavos)} />
          {/*
            O gasto de hoje é a pergunta de quem abre esta tela no meio do dia,
            e é o número que uma área de cobrança mostra primeiro. Null quando
            a sincronia ainda não cobriu o dia: zero afirmaria que os anúncios
            estão parados.
          */}
          <Apoio
            rotulo="Hoje"
            valor={gastoDeHoje === null ? "Ainda sem medida" : formatCentsAsBRL(gastoDeHoje)}
          />
          <Apoio
            rotulo="Ritmo por dia"
            // Ritmo zero não é ritmo: enquanto nada foi gasto, ele é desconhecido.
            valor={situacao.ritmoDiarioCentavos === null ? "Sem gasto ainda" : formatCentsAsBRL(situacao.ritmoDiarioCentavos)}
            nota={
              situacao.ritmoIdealCentavos !== null
                ? `para durar: ${formatCentsAsBRL(situacao.ritmoIdealCentavos)}`
                : undefined
            }
          />
          <Apoio
            rotulo="No ritmo atual, acaba"
            valor={situacao.acabaEm ? formataDia(situacao.acabaEm) : estourou ? "Já acabou" : "Sem projeção"}
          />
        </dl>
      </div>

      {/*
        A barra e a faixa de cor.

        A cor aqui não é decoração, é estado: o limiar está declarado antes de
        olhar o número (noventa por cento é atenção, cem é estouro), e não
        escolhido depois para justificar o que aconteceu.
      */}
      <div className="mt-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-panel-soft" role="presentation">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-soft ${
              consumido >= 100 ? "bg-red-500" : consumido >= 90 ? "bg-amber-500" : "bg-accent"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, consumido))}%` }}
          />
        </div>
        <p className="mt-2 text-apoio text-ink-mute">
          {situacao.consumidoPorCento === null
            ? "Verba sem valor declarado."
            : `${situacao.consumidoPorCento.toLocaleString("pt-BR")}% consumido em ${situacao.diasCorridos} ${
                situacao.diasCorridos === 1 ? "dia" : "dias"
              }`}
          {situacao.diasRestantes !== null
            ? ` · ${situacao.diasRestantes} ${situacao.diasRestantes === 1 ? "dia restante" : "dias restantes"}`
            : ""}
        </p>
      </div>

      {estourou ? (
        <Aviso tom="alerta">
          A verba foi ultrapassada em {formatCentsAsBRL(Math.abs(situacao.saldoCentavos))}. O gasto
          continua sendo contado.
        </Aviso>
      ) : acelerado ? (
        <Aviso tom="atencao">
          No ritmo atual o saldo acaba antes do fim do período. Para chegar até lá, o gasto diário
          precisa cair para {formatCentsAsBRL(situacao.ritmoIdealCentavos!)}.
        </Aviso>
      ) : null}
    </section>
  );
}

function Apoio({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{rotulo}</dt>
      <dd className="mt-0.5 font-display text-destaque font-semibold tabular-nums text-ink">
        {valor}
        {nota ? <span className="ml-2 font-sans text-rotulo font-normal text-ink-mute">{nota}</span> : null}
      </dd>
    </div>
  );
}

function Aviso({ children, tom }: { children: React.ReactNode; tom: "atencao" | "alerta" }) {
  return (
    <p
      className={`mt-5 rounded-xl border px-3.5 py-2.5 text-apoio leading-relaxed ${
        tom === "alerta"
          ? "border-red-300/60 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          : "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
      }`}
    >
      {children}
    </p>
  );
}
