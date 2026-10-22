import Link from "next/link";

/**
 * Campanhas e a verba do mês são a mesma pergunta, "para onde vai o
 * dinheiro dos anúncios", vista de dois lados. A Verba vivia fora do menu,
 * achada só por um link no subtítulo; agora é a segunda aba de Campanhas.
 */
export function AbasDeCampanhas({ ativa }: { ativa: "desempenho" | "verba" }) {
  const abas = [
    { chave: "desempenho", rotulo: "Desempenho", href: "/campanhas" },
    { chave: "verba", rotulo: "Verba do mês", href: "/verba" },
  ] as const;
  return (
    <nav className="mb-6 flex gap-1 border-b border-line" aria-label="Seções de Campanhas">
      {abas.map((aba) => {
        const atual = aba.chave === ativa;
        return (
          <Link
            key={aba.chave}
            href={aba.href}
            aria-current={atual ? "page" : undefined}
            className={`focus-ring relative -mb-px rounded-t-lg px-3.5 py-2.5 text-corpo font-medium transition-colors duration-200 ease-soft ${
              atual ? "text-ink" : "text-ink-mute hover:text-ink-soft"
            }`}
          >
            {aba.rotulo}
            {atual ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
