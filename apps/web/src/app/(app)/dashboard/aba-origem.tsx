import { EmptyState } from "@/components/ui/skeleton";
import { formatCentsAsBRL } from "@/lib/currency";
import { OriginTable } from "./origin-table";
import type { Overview } from "./tipos";

/**
 * O que traz cliente que paga.
 *
 * A tabela responde a pergunta em detalhe; a frase acima dela responde antes,
 * porque volume esconde qualidade: a origem que traz mais gente
 * frequentemente não é a que fecha melhor, e quem só olha a primeira linha
 * ordenada por leads tira a conclusão errada.
 */
export function AbaOrigem({ overview }: { overview: Overview }) {
  const { byOrigin } = overview;

  const comVenda = byOrigin.filter((origem) => origem.won > 0);
  const melhorTaxa = comVenda.reduce<(typeof byOrigin)[number] | null>(
    (melhor, origem) =>
      !melhor || origem.won / Math.max(origem.leads, 1) > melhor.won / Math.max(melhor.leads, 1) ? origem : melhor,
    null,
  );
  const maiorVolume = byOrigin.reduce<(typeof byOrigin)[number] | null>(
    (maior, origem) => (!maior || origem.leads > maior.leads ? origem : maior),
    null,
  );

  return (
    <div className="space-y-5">
      {melhorTaxa && maiorVolume ? (
        <section className="surface relative isolate overflow-hidden p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-[8%] -top-[70%] h-[150%] w-[55%] rounded-full opacity-60 blur-[70px] [background:radial-gradient(closest-side,rgb(var(--accent)/0.20),transparent)]"
          />
          <div className="relative grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-rotulo font-semibold uppercase tracking-[0.12em] text-ink-mute">Fecha melhor</p>
              <p className="mt-1.5 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight tracking-tight text-ink">
                {melhorTaxa.label}
              </p>
              <p className="mt-1 text-corpo text-ink-soft">
                {Math.round((melhorTaxa.won / Math.max(melhorTaxa.leads, 1)) * 100)}% dos leads viram cliente ·{" "}
                {formatCentsAsBRL(melhorTaxa.revenueCents)}
              </p>
            </div>

            <div className="sm:border-l sm:border-line/70 sm:pl-6">
              <p className="text-rotulo font-semibold uppercase tracking-[0.12em] text-ink-mute">Traz mais gente</p>
              <p className="mt-1.5 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight tracking-tight text-ink">
                {maiorVolume.label}
              </p>
              <p className="mt-1 text-corpo text-ink-soft">
                {maiorVolume.leads} leads ·{" "}
                {maiorVolume.key === melhorTaxa.key
                  ? "e é também a que fecha melhor"
                  : `${Math.round((maiorVolume.won / Math.max(maiorVolume.leads, 1)) * 100)}% viram cliente`}
              </p>
            </div>
          </div>

          {/* A frase que fecha o raciocínio, quando as duas não coincidem. */}
          {maiorVolume.key !== melhorTaxa.key ? (
            <p className="relative mt-6 border-t border-line/60 pt-5 text-corpo leading-relaxed text-ink-soft">
              A origem que traz mais gente não é a que fecha melhor. Comparar as duas pelo número de leads levaria a
              investir no lugar errado.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="surface p-6">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Todas as origens</h2>
        <p className="mb-5 mt-0.5 text-apoio text-ink-mute">Clique num título para reordenar</p>

        {byOrigin.length > 0 ? (
          <OriginTable origens={byOrigin} />
        ) : (
          <EmptyState
            title="Nenhuma origem registrada"
            description="A origem aparece quando o lead chega por link rastreável ou por anúncio Click-to-WhatsApp."
          />
        )}
      </section>
    </div>
  );
}
