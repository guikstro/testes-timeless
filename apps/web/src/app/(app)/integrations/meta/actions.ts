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
