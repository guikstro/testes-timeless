import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * A moldura das telas de entrada.
 *
 * Existe para as telas de recuperação nascerem com a mesma cara da de login,
 * em vez de virarem duas páginas soltas que parecem de outro produto. A tela
 * de login mantém o próprio layout: ela tem o gesto tipográfico grande e o
 * nome de quem entrou por último, e generalizar tudo isso agora custaria mais
 * do que repetir a casca.
 */
export function MolduraDeAutenticacao({
  titulo,
  descricao,
  children,
  rodape,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-canvas px-6 py-8">
      {/* Um brilho só, na cor da marca, como na entrada. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-30vh] h-[70vh] w-[110vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(var(--accent)/0.16),transparent)] blur-[80px] motion-safe:animate-drift" />
      </div>

      <header className="relative z-10 flex items-center justify-between">
        <p className="flex items-center gap-2.5 text-rotulo font-semibold uppercase tracking-[0.2em] text-ink-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Built to last
        </p>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center py-10">
        <div className="animate-rise-in w-full max-w-[30rem]">
          <h1 className="font-display text-[clamp(2rem,5.5vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
            {titulo}
          </h1>
          <p className="mt-5 max-w-sm text-destaque leading-relaxed text-ink-soft">{descricao}</p>

          {children}

          <p className="mt-8 text-corpo text-ink-mute">
            {rodape ?? (
              <>
                Lembrou a senha?{" "}
                <Link
                  href="/login"
                  className="focus-ring rounded font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-accent"
                >
                  Voltar para a entrada
                </Link>
              </>
            )}
          </p>
        </div>
      </main>

      <footer className="relative z-10 text-rotulo text-ink-mute">
        Tracking e atribuição de conversões
      </footer>
    </div>
  );
}

/** O mesmo campo de traço embaixo usado na entrada. */
export const CAMPO =
  "peer h-12 w-full border-0 border-b border-line bg-transparent px-0 text-destaque text-ink " +
  "transition-colors duration-200 placeholder:text-ink-mute/60 " +
  "focus:border-accent focus:outline-none focus:ring-0";

/** O mesmo botão grande e redondo da entrada. */
export const BOTAO =
  "focus-ring group mt-1 inline-flex h-14 items-center justify-between gap-3 rounded-full bg-accent px-7 " +
  "text-destaque font-semibold text-accent-contrast transition-all duration-300 ease-soft " +
  "hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60";
