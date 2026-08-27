import { MembershipRole, PlatformRole } from "@prisma/client";

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
  /**
   * Prazo absoluto da impersonação, em segundos desde a época. Anda junto
   * com `impersonating` e **não** é estendido pelo refresh — é o que impede
   * uma visita a um cliente de virar acesso permanente só porque o operador
   * deixou a aba aberta.
   */
  impersonationExpiresAt?: number;
  /** Unique per issuance — guarantees access/refresh tokens never collide even when minted in the same second. */
  jti: string;
}

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** True quando esta sessão é um operador da plataforma agindo dentro de um cliente. */
  impersonating: boolean;
  /**
   * Preenchido pelo `PlatformAdminGuard` a partir do banco, nunca do token —
   * só existe nas rotas de administração, e evita uma segunda consulta no
   * controller. Ausente em toda rota comum.
   */
  platformRole?: PlatformRole;
}
