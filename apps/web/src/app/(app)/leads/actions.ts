"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

/**
 * Move o lead de estágio a partir do quadro.
 *
 * A validação de "só anda para frente" vive na API e continua valendo: o
 * quadro impede o gesto por conveniência, mas quem garante a regra é o
 * servidor, não a tela.
 */
export async function moverEstagio(
  leadId: string,
  status: "QUALIFIED" | "MEETING_SCHEDULED" | "WON",
): Promise<{ error?: string } | void> {
  try {
    await apiFetch(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível mover o lead." };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}
