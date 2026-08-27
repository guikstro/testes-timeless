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

export interface QrCodeState {
  status: "PENDING_QR" | "CONNECTED";
  qrCodeBase64: string | null;
  displayPhoneNumber: string | null;
}

/** Inicia a conexão por QR Code e devolve o primeiro código para leitura. */
export async function startQrCodeConnection(): Promise<QrCodeState | { error: string }> {
  try {
    return await apiFetch<QrCodeState>("/integrations/whatsapp/qr/connect", { method: "POST" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível iniciar a conexão." };
  }
}

/**
 * Busca o QR atual. Chamado em intervalos pela tela enquanto o status for
 * PENDING_QR, porque a Evolution rotaciona o código a cada ~30s.
 */
export async function pollQrCode(): Promise<QrCodeState | { error: string }> {
  try {
    return await apiFetch<QrCodeState>("/integrations/whatsapp/qr");
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível atualizar o QR Code." };
  }
}

/** Chamado assim que o QR é lido, para a tela refletir o número conectado. */
export async function refreshWhatsAppPage(): Promise<void> {
  revalidatePath("/integrations/whatsapp");
}
