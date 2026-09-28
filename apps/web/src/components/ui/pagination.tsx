import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Anterior e próxima, com onde se está: "21–40 de 134".
 *
 * Por link (`hrefDaPagina`) sempre que der: a página vira endereço, o voltar
 * do navegador funciona e a lista pode ser montada no servidor. Numerar cada
 * página não ajuda em lista que muda o tempo todo, como leads, e ocupa a
 * largura que o celular não tem.
 */
export function Pagination({
  pagina,
  porPagina,
  total,
  hrefDaPagina,
  className,
}: {
  /** Começa em 1. */
  pagina: number;
  porPagina: number;
  total: number;
  hrefDaPagina: (pagina: number) => string;
  className?: string;
}) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(total, pagina * porPagina);

  return (
    <nav aria-label="Paginação" className={cn("flex items-center justify-between gap-3 pt-4", className)}>
      <p className="tnum text-apoio text-ink-mute">
        {inicio}–{fim} de {total}
      </p>
      <div className="flex items-center gap-1">
        <Passo href={pagina > 1 ? hrefDaPagina(pagina - 1) : null} rotulo="Página anterior">
          <path d="m12.5 5-5 5 5 5" />
        </Passo>
        <span className="tnum px-2 text-apoio text-ink-soft" aria-current="page">
          {pagina} / {ultima}
        </span>
        <Passo href={pagina < ultima ? hrefDaPagina(pagina + 1) : null} rotulo="Próxima página">
          <path d="m7.5 5 5 5-5 5" />
        </Passo>
      </div>
    </nav>
  );
}

function Passo({ href, rotulo, children }: { href: string | null; rotulo: string; children: ReactNode }) {
  const classe =
    "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel text-ink-soft shadow-subtle transition-colors";
  const icone = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      {children}
    </svg>
  );
  // Sem destino, o botão continua ali (para a posição não pular), só apagado.
  return href ? (
    <Link href={href} aria-label={rotulo} className={cn(classe, "hover:border-ink/25 hover:text-ink")}>
      {icone}
    </Link>
  ) : (
    <span aria-hidden className={cn(classe, "opacity-40")}>
      {icone}
    </span>
  );
}
