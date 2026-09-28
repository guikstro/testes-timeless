"use client";

import { useEffect, useState } from "react";
import { BOTAO, CAMPO, LinkDaEntrada, MolduraDeAutenticacao } from "@/components/moldura-de-autenticacao";

type Convite =
  | { fase: "carregando" }
  | { fase: "valido"; organizacao: string; email: string; contaExiste: boolean }
  | { fase: "invalido"; mensagem: string };

const rotulo = "mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute";

export function AceitaConvite({ token }: { token: string }) {
  const [convite, setConvite] = useState<Convite>({ fase: "carregando" });
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [pedindoCodigo, setPedindoCodigo] = useState(false);

  useEffect(() => {
    fetch(`/api/convites/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (resposta) => {
        const corpo = await resposta.json().catch(() => null);
        setConvite(
          resposta.ok && corpo
            ? { fase: "valido", organizacao: corpo.organizacao, email: corpo.email, contaExiste: Boolean(corpo.contaExiste) }
            : { fase: "invalido", mensagem: corpo?.message ?? "Este convite é inválido ou já venceu." },
        );
      })
      .catch(() => setConvite({ fase: "invalido", mensagem: "Sem conexão com o servidor." }));
  }, [token]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch(`/api/convites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, senha }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.message ?? "Não foi possível criar a conta.");
        return;
      }
      // Navegação completa: a tela inicial decide para onde a pessoa vai.
      window.location.assign("/");
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  /*
    Quem já tem conta não cria senha: prova que é dona dela aqui mesmo, com a
    senha e, se usar, o código do autenticador. Não passa pela entrada porque
    quem ficou sem nenhuma conta (a única foi excluída) não consegue entrar.
  */
  async function aceitarComSenha(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch(`/api/convites/${encodeURIComponent(token)}/com-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedindoCodigo ? { senha, codigo } : { senha }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        if (corpo?.code === "MFA_NECESSARIO") {
          setPedindoCodigo(true);
          return;
        }
        setErro(corpo?.message ?? "Não foi possível aceitar o convite.");
        return;
      }
      window.location.assign("/");
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  if (convite.fase === "valido" && convite.contaExiste) {
    return (
      <MolduraDeAutenticacao
        rodape={<LinkDaEntrada pergunta="Esqueceu a senha?" acao="Entrar e recuperar" />}
        titulo={`Acesso a ${convite.organizacao}`}
        descricao={`Você já tem conta com ${convite.email}. Digite a senha dela para aceitar.`}
      >
        <form onSubmit={aceitarComSenha} className="mt-10 flex flex-col gap-7">
          <div>
            <label htmlFor="senha" className={rotulo}>
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={CAMPO}
            />
          </div>
          {pedindoCodigo ? (
            <div>
              <label htmlFor="codigo" className={rotulo}>
                Código do autenticador
              </label>
              <input
                id="codigo"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                minLength={6}
                maxLength={32}
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className={CAMPO}
                autoFocus
              />
            </div>
          ) : null}
          {erro ? (
            <p role="alert" className="border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
              {erro}
            </p>
          ) : null}
          <button type="submit" disabled={enviando} aria-busy={enviando || undefined} className={BOTAO}>
            {enviando ? "Aceitando" : "Aceitar convite"}
          </button>
        </form>
      </MolduraDeAutenticacao>
    );
  }

  if (convite.fase !== "valido") {
    return (
      <MolduraDeAutenticacao rodape={<LinkDaEntrada pergunta="Já criou sua senha?" acao="Entrar" />}
        titulo={convite.fase === "carregando" ? "Abrindo o convite..." : "Convite indisponível"}
        descricao={convite.fase === "invalido" ? convite.mensagem : "Só um instante."}
      >
        <span />
      </MolduraDeAutenticacao>
    );
  }

  return (
    <MolduraDeAutenticacao rodape={<LinkDaEntrada pergunta="Já criou sua senha?" acao="Entrar" />} titulo={`Acesso a ${convite.organizacao}`} descricao={`Crie sua senha para entrar como ${convite.email}.`}>
      <form onSubmit={enviar} className="mt-10 flex flex-col gap-7">
        <div>
          <label htmlFor="nome" className={rotulo}>
            Seu nome
          </label>
          <input id="nome" required minLength={2} maxLength={80} autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} />
        </div>
        <div>
          <label htmlFor="senha" className={rotulo}>
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Ao menos oito caracteres"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={CAMPO}
          />
        </div>
        {erro ? (
          <p role="alert" className="border-l-2 border-red-500 pl-3 text-corpo text-red-600 dark:text-red-400">
            {erro}
          </p>
        ) : null}
        <button type="submit" disabled={enviando} aria-busy={enviando || undefined} className={BOTAO}>
          {enviando ? "Criando conta" : "Criar conta e entrar"}
        </button>
      </form>
    </MolduraDeAutenticacao>
  );
}
