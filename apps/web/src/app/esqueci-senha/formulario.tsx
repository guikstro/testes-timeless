"use client";

import { useState } from "react";
import { BOTAO, CAMPO, MolduraDeAutenticacao } from "@/components/moldura-de-autenticacao";

export function FormularioDeRecuperacao() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const resposta = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      /*
        Sucesso mesmo quando a conta não existe.

        A API responde igual para os dois casos de propósito, e a tela precisa
        acompanhar: mostrar "e-mail não encontrado" transformaria esta página
        num verificador de quem tem conta aqui, que é exatamente o que a
        resposta genérica da API existe para evitar.

        O 429 é a exceção, porque ali a pessoa precisa saber que deve esperar.
      */
      if (resposta.status === 429) {
        setErro("Muitas tentativas. Espere alguns minutos e tente de novo.");
        return;
      }
      if (!resposta.ok) {
        setErro("Não foi possível enviar agora. Tente de novo em instantes.");
        return;
      }

      setEnviado(true);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  if (enviado) {
    return (
      <MolduraDeAutenticacao
        titulo="Confira seu e-mail"
        descricao={`Se existir uma conta com ${email}, o link para criar uma senha nova chegou lá. Ele vale por uma hora.`}
      >
        <div className="mt-8 border-l-2 border-accent pl-4">
          <p className="text-corpo text-ink-soft">
            Não chegou? Olhe a caixa de spam. O e-mail pode levar alguns minutos.
          </p>
        </div>
      </MolduraDeAutenticacao>
    );
  }

  return (
    <MolduraDeAutenticacao
      titulo="Esqueci a senha"
      descricao="Diga o e-mail da conta e enviamos um link para você criar uma senha nova."
    >
      <form onSubmit={enviar} className="mt-10 flex flex-col gap-7">
        <div>
          <label htmlFor="recuperar-email" className="mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute">
            E-mail
          </label>
          <input
            id="recuperar-email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@empresa.com"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            className={CAMPO}
          />
        </div>

        {erro ? (
          <p role="alert" className="animate-rise-in border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
            {erro}
          </p>
        ) : null}

        <button type="submit" disabled={carregando} aria-busy={carregando || undefined} className={BOTAO}>
          <span>{carregando ? "Enviando" : "Enviar link"}</span>
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
