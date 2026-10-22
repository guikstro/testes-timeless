import Link from "next/link";
import { ReactNode } from "react";
import { Marca } from "@/components/marca";
import { ThemeToggle } from "@/components/theme-toggle";
import { EMPRESA, VERSAO_DOS_TERMOS } from "@/lib/empresa";

/**
 * A casca das páginas públicas de termos e privacidade.
 *
 * Abertas sem login, porque quem ainda vai se cadastrar precisa ler antes de
 * aceitar, e um lead que pede os próprios dados nunca teve conta.
 */
export function PaginaLegal({ titulo, resumo, children }: { titulo: string; resumo: string; children: ReactNode }) {
  const [ano, mes, dia] = VERSAO_DOS_TERMOS.split("-");
  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <Link href="/login" className="focus-ring flex items-center gap-2.5 rounded text-corpo font-semibold text-ink">
          <Marca tamanho={18} className="shrink-0 text-accent" />
          {EMPRESA.nome}
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl pb-20 pt-14">
        <h1 className="font-display text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-tight tracking-tight text-ink">
          {titulo}
        </h1>
        <p className="mt-4 max-w-2xl text-destaque leading-relaxed text-ink-soft">{resumo}</p>
        <p className="mt-3 text-apoio text-ink-mute">
          Em vigor desde {dia}/{mes}/{ano}.
        </p>

        <div className="mt-12 space-y-10 text-corpo leading-relaxed text-ink-soft [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_li]:mt-1.5 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>

        <nav className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-apoio text-ink-mute">
          <Link href="/termos" className="underline decoration-line underline-offset-4 hover:text-ink">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="underline decoration-line underline-offset-4 hover:text-ink">
            Política de privacidade
          </Link>
          <Link href="/login" className="underline decoration-line underline-offset-4 hover:text-ink">
            Entrar
          </Link>
        </nav>
      </main>
    </div>
  );
}

/** Quem é a Timeless, em uma frase, com o que estiver preenchido em `EMPRESA`. */
export function Identificacao() {
  const partes = [EMPRESA.razaoSocial, EMPRESA.cnpj ? `CNPJ ${EMPRESA.cnpj}` : null].filter(Boolean);
  return partes.length ? <>{partes.join(", ")}</> : <>a {EMPRESA.nome}</>;
}

/** Como falar com quem cuida da privacidade. */
export function Contato() {
  return EMPRESA.emailDePrivacidade ? (
    <>
      pelo e-mail <strong>{EMPRESA.emailDePrivacidade}</strong>
    </>
  ) : (
    <>pelos canais de atendimento da {EMPRESA.nome}</>
  );
}
