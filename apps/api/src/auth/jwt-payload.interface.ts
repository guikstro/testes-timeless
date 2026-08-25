import { MembershipRole } from "@prisma/client";

export interface JwtPayload {
  sub: string;
  organizationId: string;
  role: MembershipRole;
  /** Unique per issuance — guarantees access/refresh tokens never collide even when minted in the same second. */
  jti: string;
}

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}
