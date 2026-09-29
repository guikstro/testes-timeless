/*
     /\___/\
    ( ⌐■_■ )    VIGO
     >  ᴥ  <    by mozycking
*/
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE } from "@/lib/session";
import { apiFetch } from "@/lib/api-client";
import { telaInicial } from "@/lib/areas";
import type { Foco } from "@/lib/foco";

interface Sessao {
  user: { platformRole: "SUPPORT" | "ADMIN" | null };
  impersonating: boolean;
  areas: string[] | null;
  organization?: { foco: Foco };
}

/**
 * Para onde a pessoa vai ao entrar no site. A equipe Timeless (operadores da
 * plataforma) começa na lista de clientes; qualquer outro usuário, no painel.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  if (!cookieStore.get(ACCESS_TOKEN_COOKIE)?.value) redirect("/login");

  // Fora do try: `redirect` funciona lançando uma exceção, e o catch a engoliria.
  let destino = "/dashboard";
  try {
    const sessao = await apiFetch<Sessao>("/auth/session");
    destino = sessao.user.platformRole && !sessao.impersonating ? "/clientes" : telaInicial(sessao.areas, sessao.organization?.foco);
  } catch {
    // Sessão vencida ou API fora: o painel cuida disso (renova ou manda ao login).
  }
  redirect(destino);
}
