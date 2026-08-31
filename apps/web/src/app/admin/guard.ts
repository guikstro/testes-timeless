import { apiFetch } from "@/lib/api-client";

/**
 * Diz se a sessão está dentro de um cliente.
 *
 * Precisa ser chamada por cada página da administração, e não só pelo layout:
 * no App Router o layout e a página buscam dados em paralelo, então o layout
 * retornar cedo não impede a busca da página de rodar e estourar antes de a
 * tela dele aparecer.
 */
export async function estaDentroDeCliente(): Promise<boolean> {
  const session = await apiFetch<{ impersonating: boolean }>("/auth/session");
  return session.impersonating;
}
