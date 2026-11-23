import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Overview } from "../tipos";
import { Bloco, LinkDoPainel, PainelArrastavel } from "./painel-arrastavel";

export const metadata = { title: "Meu painel" };

const PERIODOS = [7, 30, 90];

/**
 * O painel que o próprio cliente monta: arrasta os blocos que quer ver,
 * reordena, alarga, tira, e compara dois links num teste A/B. Fica salvo
 * por pessoa; o Dashboard de sempre continua lá para quem não quer montar.
 */
export default async function MeuPainelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = PERIODOS.includes(Number(d)) ? Number(d) : 30;
  const [overview, painel, links] = await Promise.all([
    apiFetch<Overview>(`/analytics/overview?days=${days}`),
    apiFetch<{ blocos: Bloco[]; padrao: boolean }>("/painel"),
    apiFetch<{ items: LinkDoPainel[] }>("/tracking-links?limit=100").catch(() => ({ items: [] })),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Meu painel</h1>
          <p className="text-apoio text-ink-mute">
            Arraste os blocos da direita para o painel. Arraste de novo para mudar a ordem.
          </p>
        </div>
        <nav className="flex items-center gap-1 rounded-full border border-line bg-panel p-1 text-apoio">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`?days=${p}`}
              className={`rounded-full px-3 py-1 ${p === days ? "bg-accent text-white" : "text-ink-mute hover:text-ink"}`}
            >
              {p} dias
            </Link>
          ))}
        </nav>
      </header>
      <PainelArrastavel inicial={painel.blocos} overview={overview} links={links.items} />
    </div>
  );
}
