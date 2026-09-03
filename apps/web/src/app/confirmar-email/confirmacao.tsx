"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BOTAO, MolduraDeAutenticacao } from "@/components/moldura-de-autenticacao";

export function ConfirmacaoDeEmail() {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  if (!token) {
    return (
      <MolduraDeAutenticacao
        titulo="Link incompleto"
        descricao="Este endereço não traz o código de confirmação. Ele costuma se perder quando o link é copiado pela metade."
        rodape={
          <>
            Peça a troca de novo em{" "}
            <Link href="/settings" className="focus-ring rounded font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-accent">
              configurações
            </Link>
            .
          </>
        }
      >
        <span />
      </MolduraDeAutenticacao>
    );
  }

  async function confirmar() {
    setErro(null);
    setCarregando(true);

    try {
      const resposta = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!resposta.ok) {
        setErro(
          resposta.status === 409
            ? "Este endereço já está em uso por outra conta."
            : "Este link não vale mais. Ele dura um dia e só pode ser usado uma vez.",
        );
        return;
      }

      router.push("/login?emailTrocado=1");
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <MolduraDeAutenticacao
      titulo="Confirmar e-mail"
      descricao="Este endereço passará a ser o seu login. As sessões abertas em outros aparelhos serão encerradas."
    >
      {/*
        Um botão, e não confirmação automática ao abrir.

        Varredor de link de provedor de e-mail abre endereços sozinho para
        conferir segurança. Se abrir bastasse, a troca aconteceria antes de a
        pessoa sequer ver a mensagem.
      */}
      <div className="mt-10 flex flex-col gap-7">
        {erro ? (
          <p role="alert" className="animate-rise-in border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
            {erro}
          </p>
        ) : null}

        <button type="button" onClick={confirmar} disabled={carregando} aria-busy={carregando || undefined} className={BOTAO}>
          <span>{carregando ? "Confirmando" : "Confirmar troca"}</span>
          {carregando ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-30" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] transition-transform duration-300 ease-soft group-hover:translate-x-1" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </button>
      </div>
    </MolduraDeAutenticacao>
  );
}
