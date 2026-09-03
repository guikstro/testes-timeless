import { ReactNode } from "react";
import { Delta } from "@/components/ui/delta";
import { formatCentsAsBRL } from "@/lib/currency";

/**
 * A abertura da tela.
 *
 * Uma afirmação por vez, em tipo grande, em vez de cinco cartões iguais
 * disputando a primeira leitura. O número de leads é o assunto; receita é a
 * segunda frase; o resto do painel detalha depois.
 *
 * O brilho atrás não é enfeite solto: ele ancora o bloco e dá a ele o peso de
 * capa que o resto da página não tem, que é o que separa uma tela com
 * hierarquia de uma grade de caixas.
 */
export function Hero({
  leads,
  deltaLeads,
  receitaCentavos,
  deltaReceita,
  secundarios,
}: {
  leads: number;
  deltaLeads: number | null;
  receitaCentavos: number;
  deltaReceita: number | null;
  secundarios: { rotulo: string; valor: string; nota?: string }[];
}) {
  return (
    <section className="surface relative isolate overflow-hidden p-6 sm:p-8">
      {/* Aurora presa ao bloco, e não ao fundo da página: aqui ela marca o
          começo da leitura, em vez de flutuar solta atrás de tudo. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-[10%] -top-[60%] h-[130%] w-[70%] rounded-full opacity-70 blur-[70px] [background:radial-gradient(closest-side,rgb(var(--accent)/0.22),transparent)]"
      />

      <div className="relative flex flex-wrap items-end gap-x-12 gap-y-6">
        <Numero rotulo="Leads no período" valor={leads.toLocaleString("pt-BR")} delta={deltaLeads} />
        <Numero
          rotulo="Receita atribuída"
          valor={formatCentsAsBRL(receitaCentavos)}
          delta={deltaReceita}
          menor
        />
      </div>

      {/* Os apoios em linha, separados por fio: são contexto do número acima,
          não cinco assuntos paralelos. */}
      <dl className="relative mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-line/70 pt-5">
        {secundarios.map((item) => (
          <div key={item.rotulo}>
            <dt className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{item.rotulo}</dt>
            <dd className="mt-0.5 font-display text-destaque font-semibold tabular-nums text-ink">
              {item.valor}
              {item.nota ? (
                <span className="ml-2 font-sans text-rotulo font-normal text-ink-mute">{item.nota}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  delta,
  menor = false,
}: {
  rotulo: string;
  valor: ReactNode;
  delta: number | null;
  menor?: boolean;
}) {
  return (
    <div>
      <p className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{rotulo}</p>
      <p
        className={`mt-1 font-display font-semibold leading-none tracking-tight tabular-nums text-ink ${
          menor ? "text-[clamp(1.6rem,3.4vw,2.4rem)]" : "text-[clamp(2.4rem,6vw,4rem)]"
        }`}
      >
        {valor}
      </p>
      <div className="mt-2">
        <Delta delta={delta} />
      </div>
    </div>
  );
}
