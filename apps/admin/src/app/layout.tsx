import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { MolduraDaAdministracao } from "./layout-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Administração Timeless",
  /*
    Fora do índice de busca, sempre.

    Não substitui autenticação nem pretende: quem procura este endereço o
    acha de outras formas. Mas não há razão para o painel que enxerga todos os
    clientes aparecer numa busca, e o custo de evitar é uma linha.
  */
  robots: { index: false, follow: false },
};

interface Sessao {
  user: { id: string; name: string; email: string; platformRole: "SUPPORT" | "ADMIN" | null };
  impersonating: boolean;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
    O login desenha a si mesmo, sem a moldura.

    O layout raiz envolve todas as rotas, inclusive as públicas, e buscar
    sessão aqui para a tela de entrada daria erro em toda visita de quem ainda
    não entrou. Ler o caminho do cabeçalho é o jeito de o layout raiz saber
    onde está.
  */
  const caminho = (await headers()).get("x-pathname") ?? "";
  const ehLogin = caminho.startsWith("/login");

  return (
    <html lang="pt-BR" className="dark">
      {/*
        Tema escuro fixo, sem alternador.

        É ferramenta interna, usada por poucas pessoas, e o contraste com o
        site do cliente é útil: olhando de longe dá para saber em qual dos dois
        você está. Um alternador aqui seria preferência pessoal custando essa
        distinção.
      */}
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {ehLogin ? children : <ComSessao>{children}</ComSessao>}
      </body>
    </html>
  );
}

async function ComSessao({ children }: { children: React.ReactNode }) {
  let sessao: Sessao;
  try {
    sessao = await apiFetch<Sessao>("/auth/session");
  } catch (erro) {
    if (erro instanceof ApiRequestError && erro.status === 401) {
      redirect("/login");
    }
    throw erro;
  }

  /*
    Quem não é operador não entra, mesmo com senha certa.

    O login já recusa, e a API barra cada rota. Isto é a terceira tranca, e
    existe porque o papel é lido do banco a cada requisição: alguém rebaixado
    no meio da sessão precisa perder o acesso agora, não quando o token vencer.
  */
  if (!sessao.user.platformRole) {
    redirect("/login?motivo=sem-acesso");
  }

  return (
    <MolduraDaAdministracao
      operador={{ email: sessao.user.email, platformRole: sessao.user.platformRole }}
    >
      {children}
    </MolduraDaAdministracao>
  );
}
