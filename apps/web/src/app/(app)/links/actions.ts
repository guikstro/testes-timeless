"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface CreateLinkState {
  error?: string;
  /** Carimbo do sucesso, para o formulário limpar os campos e confirmar. */
  criadoEm?: number;
}

export async function createTrackingLink(
  _prevState: CreateLinkState,
  formData: FormData,
): Promise<CreateLinkState> {
  // Sem nome digitado, o da plataforma escolhida: o nome serve para achar o
  // link depois, e exigir um antes de criar travava quem só queria o link.
  const name = String(formData.get("name") ?? "").trim() || String(formData.get("nomePadrao") ?? "").trim();
  const destinationUrl = String(formData.get("destinationUrl") ?? "").trim();
  const defaultSource = String(formData.get("defaultSource") ?? "").trim();
  const defaultMedium = String(formData.get("defaultMedium") ?? "").trim();
  const defaultCampaign = String(formData.get("defaultCampaign") ?? "").trim();

  if (!name || !destinationUrl) {
    return { error: "Diga para onde o link leva." };
  }

  try {
    await apiFetch("/tracking-links", {
      method: "POST",
      body: JSON.stringify({
        name,
        destinationUrl,
        ...(defaultSource ? { defaultSource } : {}),
        ...(defaultMedium ? { defaultMedium } : {}),
        ...(defaultCampaign ? { defaultCampaign } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível criar o link." };
  }

  revalidatePath("/links");
  return { criadoEm: Date.now() };
}
