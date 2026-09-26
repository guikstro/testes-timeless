import { SetMetadata } from "@nestjs/common";

/** As áreas do painel do cliente, uma por item do menu. */
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

export const AREAS_KEY = "areas";

/**
 * Quem tem **qualquer uma** destas áreas pode usar a rota. Sem argumentos,
 * libera a rota para todos (serve para abrir uma rota dentro de um
 * controller restrito). Conferido pelo `JwtAuthGuard`.
 */
export const Areas = (...areas: Area[]) => SetMetadata(AREAS_KEY, areas);
