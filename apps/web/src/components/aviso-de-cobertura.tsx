import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { formataDia, Intervalo, rotuloDoIntervalo } from "@/lib/periodo";

/** Desde quando há número de anúncio aqui, como as rotas de comparação dizem. */
export interface Cobertura {
  desde: string | null;
  /** A fonte que começa por último, e que por isso decide o `desde`. */
  limitadaPor: "META" | "GOOGLE" | null;
  /** O script do Google ainda não mandou os 13 meses anteriores. */
  googleSemHistorico: boolean;
}

/** O período e a comparação começam antes da cobertura: têm dias sem número. */
export interface Parcial {
  atual: boolean;
  comparacao: boolean;
}

/**
 * Se a porcentagem entre os dois períodos vale. Com um deles começando antes
 * do primeiro dia com número, ela compara um mês inteiro com alguns dias e
 * mostra altas que não aconteceram. Sem a informação (API anterior), vale.
 */
export function comparavel(parcial: Parcial | undefined): boolean {
  return !parcial || (!parcial.atual && !parcial.comparacao);
}

const FONTE = { META: "da Meta", GOOGLE: "do Google" } as const;

/**
 * Diz por que a porcentagem sumiu, ou por que o período parece fraco: os
 * números começam num dia, e antes dele não há nada. Some quando os dois
 * períodos estão inteiros dentro da cobertura.
 */
export function AvisoDeCobertura({
  cobertura,
  parcial,
  periodo,
  comparacao,
  rotuloDaComparacao,
  className,
}: {
  cobertura?: Cobertura;
  parcial?: Parcial;
  periodo: Intervalo;
  comparacao: Intervalo | null;
  /** Como chamar a comparação no título, quando não é um mês: "os 30 dias anteriores". */
  rotuloDaComparacao?: string;
  className?: string;
}) {
  if (!cobertura?.desde || !parcial) return null;
  const comparacaoParcial = parcial.comparacao && comparacao !== null;
  if (!parcial.atual && !comparacaoParcial) return null;

  const desde = formataDia(cobertura.desde);
  const fonte = cobertura.limitadaPor ? FONTE[cobertura.limitadaPor] : "dos anúncios";
  const semHistorico = cobertura.limitadaPor === "GOOGLE" && cobertura.googleSemHistorico;

  const complemento = semHistorico ? (
    <p className="mt-1">
      Para completar: em Integrações, gere o script do Google Ads de novo e cole no lugar do atual. Na primeira rodada
      ele traz os 13 meses anteriores.
    </p>
  ) : cobertura.limitadaPor === "META" ? (
    <p className="mt-1">A Meta manda os números a partir do dia da conexão, com uma semana para trás.</p>
  ) : null;

  const acao = semHistorico ? (
    <Link
      href="/integrations/google"
      className="focus-ring whitespace-nowrap text-apoio font-medium underline underline-offset-2 hover:opacity-80"
    >
      Abrir o Google Ads
    </Link>
  ) : undefined;

  // O período escolhido começa antes do primeiro dia: o problema é dele, e
  // não da comparação. Inteiro antes, não é "parte dos dias", é nada.
  if (parcial.atual) {
    const nada = periodo.ate < cobertura.desde;
    return (
      <Alert tom="info" className={className} titulo={nada ? "Sem números neste período" : "Período incompleto"} acao={acao}>
        <p>
          {nada
            ? `Os números ${fonte} começam aqui em ${desde}, depois deste período.`
            : `Os números ${fonte} começam aqui em ${desde}. Os dias antes disso aparecem sem gasto e sem resultado${
                comparacao ? ", e por isso a porcentagem fica de fora." : "."
              }`}
        </p>
        {complemento}
      </Alert>
    );
  }

  const nada = comparacao!.ate < cobertura.desde;
  const rotulo = rotuloDaComparacao ?? minuscula(rotuloDoIntervalo(comparacao!));
  return (
    <Alert tom="info" className={className} titulo={`Sem comparação com ${rotulo}`} acao={acao}>
      <p>
        {nada
          ? `Os números ${fonte} começam aqui em ${desde}, depois do fim do período de comparação: não há com o que comparar.`
          : `Os números ${fonte} começam aqui em ${desde}, e o período de comparação tem só os dias a partir dele. A porcentagem compararia o período inteiro com esses poucos dias e mostraria altas que não aconteceram.`}
      </p>
      {complemento}
    </Alert>
  );
}

/** "Agosto de 2026" no meio da frase. */
function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}
