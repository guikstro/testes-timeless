"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface ConnectWhatsAppState {
  error?: string;
}

export async function connectWhatsApp(
  _prevState: ConnectWhatsAppState,
  formData: FormData,
): Promise<ConnectWhatsAppState> {
  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim();
  const displayPhoneNumber = String(formData.get("displayPhoneNumber") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();

  if (!phoneNumberId || !displayPhoneNumber) {
    return { error: "Phone Number ID e número são obrigatórios." };
  }

  try {
    await apiFetch("/integrations/whatsapp/connect", {
      method: "POST",
      body: JSON.stringify({
        phoneNumberId,
        displayPhoneNumber,
        ...(accessToken ? { accessToken } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível conectar." };
  }

  revalidatePath("/integrations/whatsapp");
  return {};
}

export async function disconnectWhatsApp(): Promise<void> {
  await apiFetch("/integrations/whatsapp/disconnect", { method: "POST" });
  revalidatePath("/integrations/whatsapp");
}
