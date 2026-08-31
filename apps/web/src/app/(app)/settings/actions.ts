"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface CreateRuleState {
  error?: string;
}

export async function createClassificationRule(
  _prevState: CreateRuleState,
  formData: FormData,
): Promise<CreateRuleState> {
  const targetStatus = String(formData.get("targetStatus") ?? "");
  const phrase = String(formData.get("phrase") ?? "").trim();

  const validTargets = ["QUALIFIED", "MEETING_SCHEDULED", "WON"];
  if (!phrase || !validTargets.includes(targetStatus)) {
    return { error: "Escolha o tipo de gatilho e informe a frase." };
  }

  try {
    await apiFetch("/classification-rules", {
      method: "POST",
      body: JSON.stringify({ targetStatus, phrase }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.body.message };
    }
    return { error: "Não foi possível criar a regra." };
  }

  revalidatePath("/settings");
  return {};
}

export async function deleteClassificationRule(id: string): Promise<void> {
  await apiFetch(`/classification-rules/${id}`, { method: "DELETE" });
  revalidatePath("/settings");
}
