"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const FALLBACK = "Não foi possível entrar.";

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const body = await resposta.json();
    return typeof body?.message === "string" ? body.message : FALLBACK;
  } catch {
    return resposta.status >= 500 ? "O servidor não respondeu. Tente de novo." : FALLBACK;
  }
}

/**
 * Entrada da administração.
 *
 * Deliberadamente sem "esqueci a senha", sem "criar conta" e sem lembrar quem
 * entrou por último. As três coisas são boas no site do cliente e são
 * superfície a mais aqui: recuperação de senha é um caminho para dentro que
 * depende de e-mail, cadastro não existe, e guardar o nome de quem opera a
 * plataforma num navegador é contar a quem senta nele qual conta atacar.
 *
 * Quem esquecer a senha a redefine pelo site do cliente, onde a conta também
 * existe, e volta aqui.
 */
export function LoginDaAdministracao() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pedindoCodigo, setPedindoCodigo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: senha }),
      });

      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        return;
      }

      const body = await resposta.json().catch(() => null);
      if (body?.mfaObrigatorio) {
        setPedindoCodigo(true);
        return;
      }

      router.push(searchParams.get("next") ?? "/");
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resposta = await fetch("/api/auth/mfa/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });

      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        const body = await resposta.clone().json().catch(() => null);
        if (body?.code === "DESAFIO_EXPIRADO") {
          setPedindoCodigo(false);
          setCodigo("");
        }
        return;
      }

      router.push(searchParams.get("next") ?? "/");
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const MOTIVOS: Record<string, string> = {
    "sessao-encerrada": "Sua sessão foi encerrada. Entre de novo.",
    "sem-acesso": "Esta conta não opera a plataforma.",
  };
  const motivo = MOTIVOS[searchParams.get("motivo") ?? ""];

  const campo =
    "h-12 w-full rounded-xl border border-line bg-panel px-3.5 text-corpo text-ink transition-colors " +
    "placeholder:text-ink-mute/50 focus:border-accent focus:outline-none";
  const rotulo = "mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <p className="text-rotulo font-semibold uppercase tracking-[0.2em] text-ink-mute">Timeless</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Administração</h1>
        <p className="mt-1.5 text-corpo leading-relaxed text-ink-mute">
          Acesso restrito a quem opera a plataforma. Esta não é a entrada dos clientes.
        </p>

        {motivo && !pedindoCodigo ? (
          <p role="status" className="mt-6 border-l-2 border-accent pl-3 text-corpo text-ink-soft">
            {motivo}
          </p>
        ) : null}

        {pedindoCodigo ? (
          <form onSubmit={confirmar} className="mt-8 space-y-5">
            <div>
              <label htmlFor="adm-codigo" className={rotulo}>
                Código de verificação
              </label>
              <input
                id="adm-codigo"
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                required
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className={`${campo} font-mono tracking-[0.4em]`}
              />
              <p className="mt-2 text-apoio leading-relaxed text-ink-mute">
                Os seis dígitos do seu autenticador, ou um código de recuperação.
              </p>
            </div>

            {erro ? <Erro>{erro}</Erro> : null}

            <Botao enviando={enviando}>{enviando ? "Confirmando" : "Confirmar"}</Botao>

            <button
              type="button"
              onClick={() => {
                setPedindoCodigo(false);
                setCodigo("");
                setErro(null);
              }}
              className="focus-ring rounded text-apoio text-ink-mute underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              Voltar
            </button>
          </form>
        ) : (
          <form onSubmit={entrar} className="mt-8 space-y-5">
            <div>
              <label htmlFor="adm-email" className={rotulo}>
                E-mail
              </label>
              <input
                id="adm-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="adm-senha" className={rotulo}>
                Senha
              </label>
              <input
                id="adm-senha"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className={campo}
              />
            </div>

            {erro ? <Erro>{erro}</Erro> : null}

            <Botao enviando={enviando}>{enviando ? "Entrando" : "Entrar"}</Botao>
          </form>
        )}
      </div>
    </div>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="border-l-2 border-red-500 pl-3 text-corpo leading-relaxed text-red-400">
      {children}
    </p>
  );
}

function Botao({ enviando, children }: { enviando: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={enviando}
      aria-busy={enviando || undefined}
      className="focus-ring h-12 w-full rounded-xl bg-accent px-5 text-corpo font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
