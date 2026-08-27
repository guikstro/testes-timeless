import { MembershipRole } from "@prisma/client";

export interface JwtPayload {
  /**
   * Sempre o usuário humano real. Numa sessão de impersonação (Fase 9) este
   * continua sendo o operador da plataforma, e não alguém do cliente — é o
   * que faz toda auditoria apontar para quem de fato agiu.
   */
  sub: string;
  organizationId: string;
  role: MembershipRole;
  /**
   * Presente só quando um operador da plataforma entrou numa organização.
   * Precisa sobreviver ao refresh: sem isso, renovar o token transformaria
   * uma impersonação numa sessão comum do cliente, apagando o aviso na tela
   * e a rastreabilidade de quem estava lá dentro.
   */
  impersonating?: true;
  /** Unique per issuance — guarantees access/refresh tokens never collide even when minted in the same second. */
  jti: string;
}

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** True quando esta sessão é um operador da plataforma agindo dentro de um cliente. */
  impersonating: boolean;
}
