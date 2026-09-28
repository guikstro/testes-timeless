/**
 * O que a pessoa pode fazer nesta conta, como a API disse na sessão.
 *
 * O site não decide nada sobre papéis: quem decide é a API
 * (`apps/api/src/common/permissoes/capacidades.ts`), que manda a lista pronta
 * em `/auth/session`. Aqui só se pergunta por ela, para esconder o que a
 * pessoa não conseguiria fazer. A trava de verdade continua na API.
 */
export type Capacidade =
  | "settings.read"
  | "settings.manage"
  | "member.read"
  | "member.manage"
  | "owner.manage"
  | "audit.read"
  | "ad.manage";

export function pode(sessao: { capacidades?: readonly string[] }, capacidade: Capacidade): boolean {
  return sessao.capacidades?.includes(capacidade) ?? false;
}
