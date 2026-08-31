"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Lê a mensagem de erro sem confiar que a resposta tem corpo.
 *
 * Um `response.json()` direto quebra a tela com "Unexpected end of JSON input"
 * quando a API responde vazio — que é o que acontece quando ela está fora do
 * ar. Um erro de rede não pode virar tela branca.
 */
const FALLBACK = "Não foi possível entrar.";

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : FALLBACK;
  } catch {
    return response.status >= 500 ? "O servidor não respondeu. Tente novamente." : FALLBACK;
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
      // Sem rede o `fetch` rejeita antes de existir uma resposta.
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white " +
    "transition-all duration-200 ease-soft placeholder:text-white/30 " +
    "hover:border-white/20 focus:border-white/30 focus:bg-white/[0.07] focus:outline-none " +
    "focus:ring-4 focus:ring-white/10";

  return (
    // A entrada é escura de propósito, enquanto o produto é claro: é a
    // soleira, não uma tela de trabalho — pode ser dramática sem cansar
    // ninguém, porque se atravessa uma vez.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08080A] px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {/*
          A aurora usa o mesmo laranja das séries dos gráficos. Não é uma cor
          escolhida à toa: é a que o produto já usa, então a entrada e o
          dashboard falam a mesma língua.
        */}
        {/*
          A aurora sangra pela borda esquerda e sobe até o meio da tela. Um
          brilho todo dentro do quadro vira "bola no fundo"; cortado pela
          borda ele lê como luz vindo de fora.
        */}
        <div className="absolute left-[-30vw] top-1/2 h-[85vh] w-[70vw] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,134,63,0.85),rgba(235,104,52,0.35)_45%,rgba(235,104,52,0.08)_70%,transparent)] blur-[60px] motion-safe:animate-drift" />
        <div
          className="absolute left-[-16vw] top-[42%] h-[46vh] w-[40vw] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(253,224,160,0.55),rgba(250,204,21,0.14)_55%,transparent)] blur-[70px] motion-safe:animate-drift"
          style={{ animationDelay: "-7s" }}
        />
        <div
          className="absolute bottom-[-18vh] right-[-14vw] h-[60vh] w-[46vw] rounded-full bg-[radial-gradient(closest-side,rgba(42,120,214,0.30),transparent_72%)] blur-[80px] motion-safe:animate-drift"
          style={{ animationDelay: "-13s" }}
        />
        {/* Textura fina: sem ela o degradê exibe bandas em telas de 8 bits. */}
        <div className="absolute inset-0 opacity-[0.16] [background-image:radial-gradient(rgba(255,255,255,0.35)_0.5px,transparent_0.5px)] [background-size:3px_3px]" />
      </div>

      <div className="animate-rise-in relative z-10 w-full max-w-[26rem]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f97a45] to-[#eb6834] shadow-[0_8px_24px_-8px_rgba(235,104,52,0.8)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.1} strokeLinecap="round" className="h-5 w-5" aria-hidden>
              <path d="M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z" />
            </svg>
          </span>

          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
            Bem-vindo de volta
          </h1>
          <p className="mt-1.5 text-[14px] text-white/50">Acompanhe cada lead do anúncio até a venda.</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="login-email" className="text-[13px] font-medium text-white/75">
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

            <div className="flex flex-col gap-2">
              <label htmlFor="login-password" className="text-[13px] font-medium text-white/75">
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
                  className={`${field} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setRevealed((current) => !current)}
                  // Sem rótulo o leitor de tela anuncia só "botão"; e o estado
                  // precisa dizer o que a senha está agora, não o que o clique fará.
                  aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={revealed}
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors duration-200 hover:bg-white/10 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
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
              <p
                role="alert"
                className="animate-rise-in rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200"
              >
                {error}
              </p>
            ) : null}

            {/*
              Texto escuro, não branco: sobre este laranja o branco fica em
              2.5:1, muito abaixo do mínimo legível. Escurecer o gradiente até
              o branco passar apagaria o brilho — o marrom profundo mantém a
              cor viva e chega a 7.3:1.
            */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f9863f] via-[#f2703a] to-[#e35c2f] text-[15px] font-semibold text-[#2a0e00] shadow-[0_10px_30px_-10px_rgba(235,104,52,0.9)] transition-all duration-200 ease-soft hover:brightness-110 hover:shadow-[0_14px_40px_-10px_rgba(235,104,52,1)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080A]"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-30" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Entrando
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-white/40">
          Não tem conta?{" "}
          <Link
            href="/register"
            className="rounded font-medium text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Criar organização
          </Link>
        </p>
      </div>
    </div>
  );
}
