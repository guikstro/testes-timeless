import { cache } from "react";
import { apiFetch } from "./api-client";

export interface SessaoAtual {
  user: { id: string; name: string; email: string; platformRole: "SUPPORT" | "ADMIN" | null };
  organization: { id: string; name: string; logoUrl: string | null; brandColor: string | null };
  impersonating: boolean;
  /** `null` é sem limite. */
  areas: string[] | null;
  /** O que a pessoa pode fazer, decidido pela API. Ver `lib/permissoes.ts`. */
  capacidades: string[];
}

/** A sessão de quem está usando, lida uma vez por requisição: o layout e as áreas perguntam a mesma coisa. */
export const sessaoAtual = cache(() => apiFetch<SessaoAtual>("/auth/session"));
