"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface OperatorFormState {
  error?: string;
  ok?: boolean;
}

export async function upsertOperator(
  _prevState: OperatorFormState,
  formData: FormData,
): Promise<OperatorFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!email) return { error: "Informe o e-mail." };
  if (role !== "SUPPORT" && role !== "ADMIN") return { error: "Escolha um nível." };

  try {
    await apiFetch("/admin/operators", { method: "PUT", body: JSON.stringify({ email, role }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível salvar." };
  }

  revalidatePath("/admin/operadores");
  return { ok: true };
}

export async function revokeOperator(userId: string): Promise<OperatorFormState> {
  try {
    await apiFetch(`/admin/operators/${userId}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível revogar." };
  }

  revalidatePath("/admin/operadores");
  return { ok: true };
}
