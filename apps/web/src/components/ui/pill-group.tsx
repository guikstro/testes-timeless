"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * O seletor de opções do produto.
 *
 * Existia solto em cinco telas, com duas bandejas diferentes e dois estados
 * ativos diferentes: quatro aparências para o mesmo controle. Quem usa não
 * aprende o padrão quando ele muda de tela para tela, e o custo disso não
 * aparece em nenhum bug, só na sensação de que o produto foi montado por
 * pessoas diferentes.
 *
 * O ativo é preenchido sólido, e não um segmento levantado: com a paleta
 * daqui, uma sombra sutil sobre um fundo quase da mesma cor não sobrevive ao
 * tema escuro.
 */
export interface OpcaoDePilula {
  chave: string;
  rotulo: ReactNode;
  icone?: ReactNode;
  /** Uma navegação. Excludente com `aoClicar`. */
  href?: string;
  aoClicar?: () => void;
  /** Explica o que a opção filtra, para quem passa o mouse. */
  titulo?: string;
}

export function GrupoDePilulas({
  opcoes,
  ativo,
  /** `grade` para muitas opções curtas, como os doze meses do ano. */
  layout = "linha",
  colunas = 6,
  className,
}: {
  opcoes: OpcaoDePilula[];
  ativo: string | null;
  layout?: "linha" | "grade";
  colunas?: number;
  className?: string;
}) {
  const emGrade = layout === "grade";

  return (
    <div
      className={cn(
        "border border-line bg-panel-soft/60 p-1",
        emGrade ? "grid gap-1 rounded-2xl" : "inline-flex flex-wrap items-center gap-1 rounded-full",
        className,
      )}
      style={emGrade ? { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` } : undefined}
    >
      {opcoes.map((opcao) => {
        const selecionada = opcao.chave === ativo;
        const classe = cn(
          "focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full",
          "text-apoio font-medium transition-all duration-200 ease-soft active:scale-95",
          emGrade ? "px-2 py-1.5" : "px-3 py-1.5",
          selecionada ? "bg-ink text-canvas shadow-subtle" : "text-ink-mute hover:text-ink",
        );

        if (opcao.href) {
          return (
            <Link
              key={opcao.chave}
              href={opcao.href}
              title={opcao.titulo}
              aria-current={selecionada ? "page" : undefined}
              className={classe}
            >
              {opcao.icone}
              {opcao.rotulo}
            </Link>
          );
        }

        return (
          <button
            key={opcao.chave}
            type="button"
            onClick={opcao.aoClicar}
            title={opcao.titulo}
            aria-pressed={selecionada}
            className={cn(classe, emGrade ? "w-full" : "flex-1 sm:flex-none")}
          >
            {opcao.icone}
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
