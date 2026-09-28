/**
 * Para onde ir depois de entrar, vindo do `?next=` da URL.
 *
 * Só caminho deste site: um `next` apontando para fora (`https://...` ou
 * `//outro.site`) faria do login um trampolim para uma página falsa, logo
 * depois de a pessoa digitar a senha.
 */
export function destinoSeguro(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
