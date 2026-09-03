import Link from "next/link";
import { formatDuration, responseSpeedTone, SPEED_TONE_CLASSES } from "@/lib/duration";
import { ArrivalHeatmap } from "./arrival-heatmap";
import type { Overview } from "./tipos";

/**
 * Estamos respondendo a tempo?
 *
 * É a pergunta que mais muda resultado numa operação de WhatsApp, e antes
 * esses números dividiam espaço com funil, origem e receita na mesma
 * rolagem. Aqui eles são o assunto.
 */
export function AbaAtendimento({ overview }: { overview: Overview }) {
  const { atendimento, chegadas } = overview;
  const total = atendimento.respondidos + atendimento.semResposta;

  return (
    <div className="space-y-5">
      <section className="surface relative isolate overflow-hidden p-6 sm:p-8">
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[6%] -top-[70%] h-[150%] w-[55%] rounded-full opacity-60 blur-[70px] [background:radial-gradient(closest-side,rgb(var(--accent)/0.18),transparent)]"
        />
        <div className="relative">
          <p className="text-rotulo font-semibold uppercase tracking-[0.12em] text-ink-mute">
            Tempo típico até a primeira resposta
          </p>
          <p
            className={`mt-2 font-display text-[clamp(2.4rem,6vw,4rem)] font-semibold leading-none tracking-tight tabular-nums ${
              SPEED_TONE_CLASSES[responseSpeedTone(atendimento.medianaPrimeiraRespostaSegundos)]
            }`}
          >
            {formatDuration(atendimento.medianaPrimeiraRespostaSegundos)}
          </p>
          {/* Mediana e não média: um lead respondido três dias depois puxaria
              a média e faria uma operação boa parecer ruim. */}
          <p className="mt-3 max-w-xl text-corpo leading-relaxed text-ink-soft">
            É a mediana, não a média: um único lead respondido dias depois puxaria a média e faria uma operação boa
            parecer ruim.
          </p>
        </div>

        <dl className="relative mt-7 flex flex-wrap gap-x-10 gap-y-4 border-t border-line/70 pt-5">
          <div>
            <dt className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">Esperando agora</dt>
            <dd className="mt-1 flex items-center gap-2 font-display text-[clamp(1.4rem,3vw,1.9rem)] font-semibold tabular-nums text-ink">
              {atendimento.aguardando}
              {atendimento.aguardando > 0 ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              ) : null}
            </dd>
            {atendimento.aguardando > 0 ? (
              <Link
                href="/conversas?status=unread"
                className="focus-ring mt-1 inline-block rounded text-rotulo text-ink-mute underline decoration-line underline-offset-4 transition-colors hover:text-ink"
              >
                Abrir na caixa de entrada
              </Link>
            ) : null}
          </div>

          <div>
            <dt className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">Nunca respondidos</dt>
            <dd className="mt-1 font-display text-[clamp(1.4rem,3vw,1.9rem)] font-semibold tabular-nums text-ink">
              {atendimento.semResposta}
            </dd>
            <p className="mt-1 text-rotulo text-ink-mute">de {total} no período</p>
          </div>

          <div>
            <dt className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">Respondidos</dt>
            <dd className="mt-1 font-display text-[clamp(1.4rem,3vw,1.9rem)] font-semibold tabular-nums text-ink">
              {atendimento.respondidos}
            </dd>
            <p className="mt-1 text-rotulo text-ink-mute">
              {total > 0 ? `${Math.round((atendimento.respondidos / total) * 100)}% do período` : "Sem base"}
            </p>
          </div>
        </dl>
      </section>

      <section className="surface p-6">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Quando os leads chegam</h2>
        <p className="mb-5 mt-0.5 text-apoio text-ink-mute">
          Por dia da semana e faixa de horário, no horário de Brasília
        </p>
        <ArrivalHeatmap celulas={chegadas} />
      </section>
    </div>
  );
}
