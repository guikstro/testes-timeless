"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDoRelatorioSemanal {
  erro?: string;
  salvoEm?: number;
}

export async function salvarRelatorioSemanal(
  _anterior: EstadoDoRelatorioSemanal,
  formData: FormData,
): Promise<EstadoDoRelatorioSemanal> {
  try {
    await apiFetch("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({ relatorioSemanal: formData.get("relatorioSemanal") === "on" }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível salvar." };
  }
  revalidatePath("/settings");
  return { salvoEm: Date.now() };
}
