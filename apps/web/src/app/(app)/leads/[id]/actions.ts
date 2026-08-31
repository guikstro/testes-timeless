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

export interface DisqualifyState {
  error?: string;
}

/**
 * Desqualificar e reativar ficam fora do formulário de status de propósito:
 * não é um degrau do funil, é uma saída lateral. Misturar os dois no mesmo
 * seletor sugeriria que desqualificar é "avançar" para algum lugar.
 */
export async function setDisqualified(
  leadId: string,
  disqualified: boolean,
  _prevState: DisqualifyState,
  formData: FormData,
): Promise<DisqualifyState> {
  const reason = String(formData.get("reason") ?? "").trim();

  try {
    await apiFetch(`/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({ disqualified, ...(disqualified && reason ? { disqualifiedReason: reason } : {}) }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: disqualified ? "Não foi possível desqualificar." : "Não foi possível reativar." };
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return {};
}

export interface SendMessageState {
  error?: string;
  /** Sinaliza sucesso para o formulário limpar o campo — `{}` também é o estado inicial. */
  sentAt?: number;
}

export async function sendMessage(
  leadId: string,
  _prevState: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    return { error: "Escreva uma mensagem." };
  }

  try {
    await apiFetch(`/leads/${leadId}/messages`, { method: "POST", body: JSON.stringify({ text }) });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível enviar a mensagem." };
  }

  revalidatePath(`/leads/${leadId}`);
  return { sentAt: Date.now() };
}
