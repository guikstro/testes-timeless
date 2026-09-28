import { SetMetadata } from "@nestjs/common";

/**
 * As áreas do painel do cliente, uma por item do menu. É o que se escolhe ao
 * convidar alguém; o que cada uma libera está em `permissoes/capacidades.ts`.
 */
export const AREAS = [
  "dashboard",
  "conversas",
  "leads",
  "campanhas",
  "verba",
  "links",
  "integracoes",
  "relatorio",
  "configuracoes",
] as const;

export type Area = (typeof AREAS)[number];
