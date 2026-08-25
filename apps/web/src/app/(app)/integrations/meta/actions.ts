"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface ConnectMetaState {
  error?: string;
}

export async function connectMeta(_prevState: ConnectMetaState, formData: FormData): Promise<ConnectMetaState> {
  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();

  if (!adAccountId || !accessToken) {
    return { error: "Ad Account ID e access token são obrigatórios." };
  }

  try {
    await apiFetch("/integrations/meta/connect", {
      method: "POST",
      body: JSON.stringify({ adAccountId, accessToken }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível conectar." };
  }

  revalidatePath("/integrations/meta");
  return {};
}

export async function disconnectMeta(): Promise<void> {
  await apiFetch("/integrations/meta/disconnect", { method: "POST" });
  revalidatePath("/integrations/meta");
}

export async function triggerMetaSync(): Promise<void> {
  await apiFetch("/integrations/meta/sync", { method: "POST" });
  revalidatePath("/integrations/meta");
  revalidatePath("/campaigns");
}

export interface ConnectMetaCapiState {
  error?: string;
}

export async function connectMetaCapi(
  _prevState: ConnectMetaCapiState,
  formData: FormData,
): Promise<ConnectMetaCapiState> {
  const pixelId = String(formData.get("pixelId") ?? "").trim();
  const capiAccessToken = String(formData.get("capiAccessToken") ?? "").trim();

  if (!pixelId || !capiAccessToken) {
    return { error: "Pixel ID e access token do Conversions API são obrigatórios." };
  }

  try {
    await apiFetch("/integrations/meta/capi/connect", {
      method: "POST",
      body: JSON.stringify({ pixelId, capiAccessToken }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível configurar o Conversions API." };
  }

  revalidatePath("/integrations/meta");
  return {};
}
