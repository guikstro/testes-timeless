"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDasAcoes {
  erro?: string;
  salvoEm?: number;
}

export async function salvarAcoesDeConversao(
  _anterior: EstadoDasAcoes,
  formData: FormData,
): Promise<EstadoDasAcoes> {
  const qualificado = String(formData.get("googleConversionQualified") ?? "").trim();
  const venda = String(formData.get("googleConversionWon") ?? "").trim();

  try {
    // String vazia é "limpar", como no resto do formulário da organização.
    await apiFetch("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({ googleConversionQualified: qualificado, googleConversionWon: venda }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível salvar os nomes." };
  }

  revalidatePath("/integrations/google");
  return { salvoEm: Date.now() };
}
