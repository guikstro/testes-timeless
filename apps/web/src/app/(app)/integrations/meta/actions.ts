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

export interface PaginaDaMetaState {
  error?: string;
  ok?: boolean;
}

/**
 * Escolhe ou troca a Página do Facebook dos Insights. A API lê o histórico
 * logo em seguida, então a aba Página do painel já nasce com três meses.
 */
export async function definePaginaDaMeta(_prevState: PaginaDaMetaState, formData: FormData): Promise<PaginaDaMetaState> {
  const paginaId = String(formData.get("paginaId") ?? "").replace(/\s/g, "");
  if (!/^\d{5,25}$/.test(paginaId)) {
    return { error: "Informe o id da Página, só os números. Ele aparece no endereço do Business, depois de asset_id=." };
  }

  try {
    await apiFetch("/integrations/meta/pagina", { method: "PUT", body: JSON.stringify({ paginaId }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível salvar a Página." };
  }

  revalidatePath("/integrations/meta");
  return { ok: true };
}

export async function tiraPaginaDaMeta(): Promise<void> {
  await apiFetch("/integrations/meta/pagina", { method: "PUT", body: JSON.stringify({ paginaId: null }) });
  revalidatePath("/integrations/meta");
}

export async function leiaPaginaDaMeta(): Promise<void> {
  await apiFetch("/integrations/meta/pagina/sync", { method: "POST" });
  revalidatePath("/integrations/meta");
}
