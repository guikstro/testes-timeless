"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BOTAO, CAMPO, MolduraDeAutenticacao } from "@/components/moldura-de-autenticacao";

const PADRAO = "Não foi possível criar a conta.";

/**
 * Lê a mensagem de erro sem confiar que a resposta tem corpo.
 *
 * Um `response.json()` direto quebra a tela com "Unexpected end of JSON input"
 * quando a API responde vazio, e um erro de rede não pode virar tela branca.
 * É a mesma proteção que a tela de entrada já tinha e esta não tinha.
 */
async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = await resposta.json();
    return typeof corpo?.message === "string" ? corpo.message : PADRAO;
  } catch {
    return resposta.status >= 500 ? "O servidor não respondeu. Tente de novo." : PADRAO;
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const resposta = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organizationName, email, password }),
      });

      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  const rotulo = "mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute";

  return (
    <MolduraDeAutenticacao
      titulo="Criar organização"
      descricao="Cada lead, do anúncio à venda, com a origem provada, nunca deduzida."
      rodape={
        <>
          Já tem conta?{" "}
          <Link
            href="/login"
            className="focus-ring rounded font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-accent"
          >
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="mt-10 flex flex-col gap-7">
        <div>
          <label htmlFor="organizationName" className={rotulo}>
            Nome da organização
          </label>
          <input
            id="organizationName"
            required
            minLength={2}
            placeholder="Sua empresa"
            value={organizationName}
            onChange={(evento) => setOrganizationName(evento.target.value)}
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="name" className={rotulo}>
            Seu nome
          </label>
          <input
            id="name"
            required
            minLength={2}
            autoComplete="name"
            placeholder="Como quer ser chamado"
            value={name}
            onChange={(evento) => setName(evento.target.value)}
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="email" className={rotulo}>
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="voce@empresa.com"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="password" className={rotulo}>
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Ao menos oito caracteres"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            className={CAMPO}
          />
        </div>

        {erro ? (
          <p role="alert" className="animate-rise-in border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
            {erro}
          </p>
        ) : null}

        <button type="submit" disabled={carregando} aria-busy={carregando || undefined} className={BOTAO}>
          <span>{carregando ? "Criando" : "Criar organização"}</span>
          {carregando ? (
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
    </MolduraDeAutenticacao>
  );
}
