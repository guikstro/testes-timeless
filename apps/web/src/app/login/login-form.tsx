"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/**
 * Lê a mensagem de erro sem confiar que a resposta tem corpo.
 *
 * Um `response.json()` direto quebra a tela com "Unexpected end of JSON input"
 * quando a API responde vazio — que é exatamente o que acontece quando ela
 * está fora do ar. Um erro de rede não pode virar uma tela branca.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : FALLBACK;
  } catch {
    return response.status >= 500 ? "O servidor não respondeu. Tente novamente." : FALLBACK;
  }
}

const FALLBACK = "Não foi possível entrar.";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      // Sem rede o `fetch` rejeita antes de existir resposta.
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/*
        Fundo em duas manchas suaves, desfocadas. Fica atrás de tudo e não
        recebe ponteiro — é atmosfera, não interface.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="animate-rise-in w-full max-w-[25rem]">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 shadow-lifted">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" className="h-6 w-6" aria-hidden>
              <path d="M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z" />
            </svg>
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
          <p className="mt-1.5 text-sm text-slate-500">Acesse sua organização</p>
        </div>

        <div className="surface p-7">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="E-mail">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>

            <Field label="Senha">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>

            {error ? (
              <p
                role="alert"
                className="animate-rise-in rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-100"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
              {loading ? "Entrando" : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          Não tem conta?{" "}
          <Link href="/register" className="focus-ring rounded font-medium text-slate-900 underline underline-offset-4 hover:text-brand">
            Criar organização
          </Link>
        </p>
      </div>
    </div>
  );
}
