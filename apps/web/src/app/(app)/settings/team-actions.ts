"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDaEquipe {
  erro?: string;
}

export async function mudarPapel(userId: string, role: string): Promise<EstadoDaEquipe> {
  try {
    await apiFetch(`/organizations/current/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível mudar o papel." };
  }

  revalidatePath("/settings");
  return {};
}

export async function removerMembro(userId: string): Promise<EstadoDaEquipe> {
  try {
    await apiFetch(`/organizations/current/members/${userId}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível remover." };
  }

  revalidatePath("/settings");
  return {};
}
