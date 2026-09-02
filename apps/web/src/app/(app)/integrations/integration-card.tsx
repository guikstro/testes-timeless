import { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export type Tom = "neutral" | "info" | "success" | "warning" | "danger";

export function Cartao({
  href,
  nome,
  descricao,
  cor,
  logo,
  rotulo,
  tom,
  detalhe,
}: {
  href: string;
  nome: string;
  descricao: string;
  /** Cor oficial da plataforma, usada só no quadradinho do logotipo. */
  cor: string;
  logo: ReactNode;
  rotulo: string;
  tom: Tom;
  detalhe: string;
}) {
  return (
    <Link
      href={href}
      className="surface group flex flex-col gap-3.5 p-5 transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-line/90 hover:shadow-lifted focus-ring"
    >
      <div className="flex items-start justify-between gap-3">
        {/*
          A cor da marca fica presa ao quadradinho do logotipo e não invade o
          resto do cartão: três verdes, azuis e amarelos disputando a mesma
          tela apagariam o acento do produto.
        */}
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-300 ease-soft group-hover:scale-105"
          style={{ color: cor, backgroundColor: `${cor}1A`, borderColor: `${cor}33` }}
        >
          {logo}
        </span>
        <Badge tone={tom}>{rotulo}</Badge>
      </div>

      <div>
        <p className="font-display text-destaque font-semibold tracking-tight text-ink">{nome}</p>
        <p className="mt-1 text-apoio leading-relaxed text-ink-mute">{descricao}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/60 pt-3">
        <span className="min-w-0 truncate text-rotulo text-ink-mute">{detalhe}</span>
        <span className="shrink-0 text-ink-mute transition-transform duration-300 ease-soft group-hover:translate-x-0.5 group-hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
