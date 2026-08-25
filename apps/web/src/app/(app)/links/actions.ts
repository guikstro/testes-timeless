"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface CreateLinkState {
  error?: string;
}

export async function createTrackingLink(
  _prevState: CreateLinkState,
  formData: FormData,
): Promise<CreateLinkState> {
  const name = String(formData.get("name") ?? "").trim();
  const destinationUrl = String(formData.get("destinationUrl") ?? "").trim();
  const defaultSource = String(formData.get("defaultSource") ?? "").trim();
  const defaultCampaign = String(formData.get("defaultCampaign") ?? "").trim();

  if (!name || !destinationUrl) {
    return { error: "Nome e destino são obrigatórios." };
  }

  try {
    await apiFetch("/tracking-links", {
      method: "POST",
      body: JSON.stringify({
        name,
        destinationUrl,
        ...(defaultSource ? { defaultSource } : {}),
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
  return {};
}
