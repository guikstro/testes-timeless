"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface UpdateLeadState {
  error?: string;
}

export async function updateLead(
  leadId: string,
  _prevState: UpdateLeadState,
  formData: FormData,
): Promise<UpdateLeadState> {
  const status = String(formData.get("status") ?? "").trim();
  const revenueReais = String(formData.get("revenueReais") ?? "").trim();

  const body: { status?: string; revenueCents?: number } = {};
  if (status) body.status = status;
  if (revenueReais) {
    const parsed = Number(revenueReais.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Valor de receita inválido." };
    }
    body.revenueCents = Math.round(parsed * 100);
  }

  if (!body.status && body.revenueCents === undefined) {
    return { error: "Escolha um novo status ou informe uma receita." };
  }

  try {
    await apiFetch(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(body) });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível salvar a correção." };
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return {};
}
