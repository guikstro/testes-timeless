import { Prisma } from "@prisma/client";

/** True for Prisma's P2002 — a unique-constraint violation, expected under concurrent writes racing a check-then-create. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
