"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export async function encerrarSessao(id: string): Promise<{ erro?: string }> {
  try {
    await apiFetch(`/auth/sessoes/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (erro) {
    if (erro instanceof ApiRequestError) return { erro: erro.body.message };
    return { erro: "Não foi possível encerrar a sessão." };
  }
  revalidatePath("/settings");
  return {};
}

export async function encerrarOutrasSessoes(): Promise<{ erro?: string; encerradas?: number }> {
  try {
    const { encerradas } = await apiFetch<{ encerradas: number }>("/auth/sessoes", { method: "DELETE" });
    revalidatePath("/settings");
    return { encerradas };
  } catch (erro) {
    if (erro instanceof ApiRequestError) return { erro: erro.body.message };
    return { erro: "Não foi possível encerrar as sessões." };
  }
}
