"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BOTAO, CAMPO, MolduraDeAutenticacao } from "@/components/moldura-de-autenticacao";

/** O mesmo mínimo que a API exige, para o erro aparecer antes da viagem. */
const MINIMO_DA_SENHA = 8;

export function FormularioDeNovaSenha() {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [revelada, setRevelada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  /*
    Sem token não há o que fazer aqui.

    Acontece quando alguém abre o endereço direto ou quando o leitor de e-mail
    corta o link. Dizer isso é melhor que mostrar um formulário que vai falhar
    depois de a pessoa escolher uma senha.
  */
  if (!token) {
    return (
      <MolduraDeAutenticacao
        titulo="Link incompleto"
        descricao="Este endereço não traz o código de recuperação. Ele costuma se perder quando o link é copiado pela metade."
        rodape={
          <>
            Peça outro em{" "}
            <Link href="/esqueci-senha" className="focus-ring rounded font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-accent">
              esqueci a senha
            </Link>
            .
          </>
        }
      >
        <span />
      </MolduraDeAutenticacao>
    );
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    // Conferido aqui só para poupar a viagem: quem manda na regra é a API.
    if (senha.length < MINIMO_DA_SENHA) {
      setErro(`A senha precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`);
      return;
    }
    if (senha !== repetida) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setCarregando(true);
    try {
      const resposta = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: senha }),
      });

      if (!resposta.ok) {
        // O caso comum é o link vencido ou já usado, e a mensagem precisa
        // dizer o caminho de volta em vez de só constatar a falha.
        setErro(
          resposta.status === 400
            ? "Este link não vale mais. Ele dura uma hora e só pode ser usado uma vez."
            : "Não foi possível trocar a senha agora. Tente de novo em instantes.",
        );
        return;
      }

      router.push("/login?senhaRedefinida=1");
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <MolduraDeAutenticacao
      titulo="Nova senha"
      descricao="Escolha uma senha nova. As outras sessões desta conta serão encerradas."
    >
      <form onSubmit={enviar} className="mt-10 flex flex-col gap-7">
        <div>
          <label htmlFor="nova-senha" className="mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute">
            Nova senha
          </label>
          <div className="relative">
            <input
              id="nova-senha"
              type={revelada ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={MINIMO_DA_SENHA}
              placeholder="••••••••"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              className={`${CAMPO} pr-11`}
            />
            <button
              type="button"
              onClick={() => setRevelada((atual) => !atual)}
              aria-label={revelada ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={revelada}
              className="focus-ring absolute right-0 top-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-mute transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
                {revelada ? (
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

        <div>
          <label htmlFor="repetir-senha" className="mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute">
            Repita a senha
          </label>
          <input
            id="repetir-senha"
            type={revelada ? "text" : "password"}
            autoComplete="new-password"
            required
            placeholder="••••••••"
            value={repetida}
            onChange={(evento) => setRepetida(evento.target.value)}
            className={CAMPO}
          />
        </div>

        {erro ? (
          <p role="alert" className="animate-rise-in border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
            {erro}
          </p>
        ) : null}

        <button type="submit" disabled={carregando} aria-busy={carregando || undefined} className={BOTAO}>
          <span>{carregando ? "Salvando" : "Salvar senha"}</span>
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
