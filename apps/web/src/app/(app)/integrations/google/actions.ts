"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoFormulario {
  error?: string;
  savedAt?: number;
}

export async function criarCampanha(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const name = String(formData.get("name") ?? "").trim();
  const externalId = String(formData.get("externalId") ?? "").trim();

  if (!name) return { error: "Dê um nome à campanha." };

  try {
    await apiFetch("/campaigns/manual", {
      method: "POST",
      body: JSON.stringify({ name, platform: "GOOGLE", ...(externalId ? { externalId } : {}) }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível criar a campanha." };
  }

  revalidatePath("/integrations/google");
  return { savedAt: Date.now() };
}

export async function lancarGasto(
  campaignId: string,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const date = String(formData.get("date") ?? "").trim();
  const reais = String(formData.get("reais") ?? "").trim();

  if (!date) return { error: "Escolha o dia." };

  const valor = Number(reais.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(valor) || valor < 0) return { error: "Valor inválido." };

  try {
    await apiFetch(`/campaigns/${campaignId}/spend`, {
      method: "POST",
      // Centavos, nunca reais quebrados: ponto flutuante perde dinheiro.
      body: JSON.stringify({ date, spendCents: Math.round(valor * 100) }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível lançar o gasto." };
  }

  revalidatePath("/integrations/google");
  return { savedAt: Date.now() };
}

export async function removerCampanha(campaignId: string): Promise<{ error?: string } | void> {
  try {
    await apiFetch(`/campaigns/${campaignId}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível remover." };
  }
  revalidatePath("/integrations/google");
}
