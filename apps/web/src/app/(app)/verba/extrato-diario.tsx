import { formatCentsAsBRL } from "@/lib/currency";
import { DiaDeGasto } from "./tipos";

/**
 * O extrato dia a dia.
 *
 * É o que separa um total de uma área de cobrança. "Cinco mil no mês" não diz
 * se foram duzentos por dia ou mil em três dias e nada no resto, e essas duas
 * situações pedem decisões opostas.
 *
 * Três decisões que não são estéticas:
 *
 * 1. **Dia futuro não é barra zerada, é espaço vazio.** Desenhar zero no resto
 *    do mês diria que o anúncio parou, quando o que houve é que o dia não
 *    chegou. O vazio também mostra quanto tempo ainda falta, que é metade da
 *    pergunta de quem olha uma verba.
 *
 * 2. **A escala é o maior dia do próprio período.** Fixar um teto faria um mês
 *    inteiro de gasto baixo virar uma linha rente ao chão, sem forma nenhuma.
 *
 * 3. **O fim de semana fica marcado.** É onde o custo por lead muda de patamar
 *    na maioria das contas, e sem a marca a pessoa conta os dias com o dedo
 *    para descobrir qual barra é sábado.
 */
export function ExtratoDiario({ dias }: { dias: DiaDeGasto[] }) {
  const comMedida = dias.filter((dia) => dia.gastoCentavos !== null);
  if (comMedida.length === 0) {
    return null;
  }

  const pico = Math.max(1, ...comMedida.map((dia) => dia.gastoCentavos ?? 0));
  const total = comMedida.reduce((soma, dia) => soma + (dia.gastoCentavos ?? 0), 0);
  const diasComGasto = comMedida.filter((dia) => (dia.gastoCentavos ?? 0) > 0);

  const maisCaro = [...diasComGasto].sort(
    (a, b) => (b.gastoCentavos ?? 0) - (a.gastoCentavos ?? 0),
  )[0];

  return (
    <section className="surface p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Extrato diário</h2>
        <p className="text-corpo text-ink-mute">
          {diasComGasto.length === 0 ? (
            "Nenhum dia com gasto registrado."
          ) : (
            <>
              <span className="font-medium text-ink">{formatCentsAsBRL(Math.round(total / comMedida.length))}</span>{" "}
              por dia em média
              {maisCaro ? (
                <>
                  {" · maior dia "}
                  <span className="font-medium text-ink">{formatCentsAsBRL(maisCaro.gastoCentavos ?? 0)}</span>
                  {` em ${diaCurto(maisCaro.dia)}`}
                </>
              ) : null}
            </>
          )}
        </p>
      </div>

      <div className="mt-6 flex h-36 items-end gap-[3px]">
        {dias.map((dia) => (
          <Barra key={dia.dia} dia={dia} pico={pico} />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-rotulo text-ink-mute">
        <span>{diaCurto(dias[0].dia)}</span>
        <span>{diaCurto(dias[dias.length - 1].dia)}</span>
      </div>
    </section>
  );
}

function Barra({ dia, pico }: { dia: DiaDeGasto; pico: number }) {
  const rotulo = `${diaCurto(dia.dia)}: ${
    dia.gastoCentavos === null ? "ainda não aconteceu" : formatCentsAsBRL(dia.gastoCentavos)
  }`;

  if (dia.gastoCentavos === null) {
    return (
      <div
        title={rotulo}
        className="h-full min-w-0 flex-1 rounded-t-[3px] border border-dashed border-line/60 bg-transparent"
      />
    );
  }

  /*
    Altura mínima de dois pixels para o dia de gasto zero.

    Sem ela, "gastou zero" e "não há barra" ficam idênticos na tela, e a
    distinção que o resto do código mantém com tanto cuidado morre na
    renderização.
  */
  const altura = dia.gastoCentavos === 0 ? 2 : Math.max(3, (dia.gastoCentavos / pico) * 100);

  return (
    <div
      title={rotulo}
      style={{ height: `${altura}%` }}
      className={`min-w-0 flex-1 rounded-t-[3px] transition-[height] duration-500 ease-soft ${
        dia.gastoCentavos === 0
          ? "bg-line"
          : fimDeSemana(dia.dia)
            ? "bg-accent/40"
            : "bg-accent"
      }`}
    />
  );
}

/** Dia civil em UTC: a data já é dia de calendário e converter fuso a desloca. */
function fimDeSemana(dia: string): boolean {
  const semana = new Date(`${dia}T00:00:00.000Z`).getUTCDay();
  return semana === 0 || semana === 6;
}

function diaCurto(dia: string): string {
  return new Date(`${dia}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
