"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError, rota } from "@/lib/api-client";

export async function marcarResolvido(id: string): Promise<{ erro?: string }> {
  try {
    await apiFetch(rota`/admin/erros/${id}/resolver`, { method: "POST" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível marcar." };
  }
  revalidatePath("/saude");
  return {};
}
