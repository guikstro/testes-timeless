"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDaVendaPelaConversa {
  erro?: string;
  salvoEm?: number;
}

export async function salvarVendaPelaConversa(
  _anterior: EstadoDaVendaPelaConversa,
  formData: FormData,
): Promise<EstadoDaVendaPelaConversa> {
  try {
    await apiFetch("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({ confirmaVendaDaConversa: formData.get("confirmaVendaDaConversa") === "on" }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível salvar." };
  }
  revalidatePath("/settings");
  return { salvoEm: Date.now() };
}
