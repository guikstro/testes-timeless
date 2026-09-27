"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDoScript {
  script?: string;
  error?: string;
}

/** Gera o script com a chave dentro. Ele volta uma vez só: a chave não fica guardada. */
export async function geraScriptDoGoogleAds(): Promise<EstadoDoScript> {
  try {
    const { script } = await apiFetch<{ script: string }>("/integrations/google/script", { method: "POST" });
    revalidatePath("/integrations/google");
    return { script };
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível gerar o script." };
  }
}

export async function desligaScriptDoGoogleAds(): Promise<{ error?: string }> {
  try {
    await apiFetch("/integrations/google/script", { method: "DELETE" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível desligar." };
  }
  revalidatePath("/integrations/google");
  return {};
}
