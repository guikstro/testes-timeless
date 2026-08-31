"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const FALLBACK = "Não foi possível entrar.";

/**
 * Lê a mensagem de erro sem confiar que a resposta tem corpo. Um
 * `response.json()` direto quebra a tela com "Unexpected end of JSON input"
 * quando a API responde vazio — e um erro de rede não pode virar tela branca.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : FALLBACK;
  } catch {
    return response.status >= 500 ? "O servidor não respondeu. Tente de novo." : FALLBACK;
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      router.push(searchParams.get("next") ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Campo com traço embaixo, não caixa fechada.
   *
   * O lockup da marca é tipografia sobre vazio; caixas com borda em volta de
   * tudo brigariam com isso. O traço marca a linha de escrita e some quando
   * não é necessário — é o mesmo princípio de deixar o conteúdo falar.
   */
  const field =
    "peer h-12 w-full border-0 border-b border-line bg-transparent px-0 text-[17px] text-ink " +
    "transition-colors duration-200 placeholder:text-ink-mute/60 " +
    "focus:border-accent focus:outline-none focus:ring-0";

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas px-6 py-8">
      {/*
        Um único brilho, na cor da marca, atrás do conteúdo. Um só, e discreto:
        a identidade da Timeless é tipografia sobre vazio, e três manchas
        coloridas seriam ruído competindo com ela.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-30vh] h-[70vh] w-[110vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(var(--accent)/0.16),transparent)] blur-[80px] motion-safe:animate-drift" />
      </div>

      <header className="relative z-10 flex items-center justify-between">
        {/*
          Sem logotipo enquanto o produto não tem nome. A tagline sustenta a
          identidade sozinha: um marcador de posição com nome falso envelhece
          pior que a ausência dele.
        */}
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Built to last
        </p>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center py-10">
        <div className="animate-rise-in w-full max-w-[30rem]">
          {/*
            Caixa alta e pesada, como os títulos do material da marca. É o
            gesto tipográfico da marca. Sem ele a tela seria genérica,
            por mais bem espaçada que estivesse.
          */}
          <h1 className="font-display text-[clamp(2.6rem,7vw,3.9rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.03em] text-ink">
            Bem-vindo
            <br />
            de volta
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink-soft">
            Cada lead, do anúncio à venda, com a origem provada, nunca deduzida.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-7">
            <div className="relative">
              <label htmlFor="login-email" className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={field}
              />
            </div>

            <div className="relative">
              <label htmlFor="login-password" className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
                Senha
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={revealed ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${field} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setRevealed((current) => !current)}
                  // O rótulo descreve o estado atual, não o que o clique fará —
                  // sem ele o leitor de tela anuncia apenas "botão".
                  aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={revealed}
                  className="focus-ring absolute right-0 top-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-mute transition-colors hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
                    {revealed ? (
                      <>
                        <path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2" />
                        <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.7 9.7 0 003.4-.6" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {error ? (
              <p role="alert" className="animate-rise-in border-l-2 border-red-500 pl-3 text-[13px] text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="focus-ring group mt-1 inline-flex h-14 items-center justify-between gap-3 rounded-full bg-accent px-7 text-[15px] font-semibold text-accent-contrast transition-all duration-300 ease-soft hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
            >
              <span>{loading ? "Entrando" : "Entrar"}</span>
              {loading ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-30" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] transition-transform duration-300 ease-soft group-hover:translate-x-1" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </form>

          <p className="mt-8 text-[13px] text-ink-mute">
            Não tem conta?{" "}
            <Link href="/register" className="focus-ring rounded font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-accent">
              Criar organização
            </Link>
          </p>
        </div>
      </main>

      <footer className="relative z-10 text-[11px] text-ink-mute">
        Tracking e atribuição de conversões
      </footer>
    </div>
  );
}
