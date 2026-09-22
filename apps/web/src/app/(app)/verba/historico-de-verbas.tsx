import { formatCentsAsBRL } from "@/lib/currency";
import { formataDia } from "@/lib/periodo";
import { Verba } from "./tipos";
import { BotaoRemoverVerba } from "./botao-remover-verba";

/**
 * Os aportes declarados, do mais recente para o mais antigo.
 *
 * Numa área de cobrança, o extrato de gasto sem o histórico de aporte conta
 * metade da história: "sobraram mil reais" só quer dizer alguma coisa junto de
 * "de quanto, colocado quando". Também é o que permite conferir um mês
 * fechado sem depender de lembrar o combinado.
 *
 * A verba de hoje vem marcada porque é a única que está governando os números
 * do resto da tela. As outras são registro.
 */
export function HistoricoDeVerbas({ verbas, hoje }: { verbas: Verba[]; hoje: string }) {
  if (verbas.length === 0) {
    return null;
  }

  return (
    <section className="surface p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Verbas declaradas</h2>

      <ul className="mt-5 divide-y divide-line/70">
        {verbas.map((verba) => {
          const vigente = ehVigente(verba, hoje);
          return (
            <li key={verba.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="flex items-baseline gap-2.5">
                  <span className="font-display text-destaque font-semibold tabular-nums text-ink">
                    {formatCentsAsBRL(verba.amountCents)}
                  </span>
                  {vigente ? (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-rotulo font-semibold uppercase tracking-[0.1em] text-brand-ink">
                      Em vigor
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-apoio text-ink-mute">
                  {verba.label ? `${verba.label} · ` : ""}
                  {formataDia(verba.startsOn)}
                  {/*
                    Verba sem fim não é verba mal preenchida: é o depósito de
                    crédito, que vale até acabar. Mostrar "sem data" soaria a
                    campo esquecido.
                  */}
                  {verba.endsOn ? ` a ${formataDia(verba.endsOn)}` : " até acabar"}
                </p>
              </div>

              <BotaoRemoverVerba id={verba.id} valor={formatCentsAsBRL(verba.amountCents)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Mesma regra do servidor: já começou e ainda não terminou. */
function ehVigente(verba: Verba, hoje: string): boolean {
  return verba.startsOn.slice(0, 10) <= hoje && (!verba.endsOn || verba.endsOn.slice(0, 10) >= hoje);
}
