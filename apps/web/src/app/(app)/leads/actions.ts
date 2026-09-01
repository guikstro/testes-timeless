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

/**
 * Responde ao lead direto do quadro.
 *
 * Existe para a fila de trabalho não exigir abrir o lead só para dizer uma
 * frase: numa lista de dezenas, esse ida e volta é o que mais custa tempo.
 */
export async function responderRapido(leadId: string, texto: string): Promise<{ error?: string } | void> {
  const limpo = texto.trim();
  if (!limpo) return { error: "Escreva uma mensagem." };

  try {
    await apiFetch(`/leads/${leadId}/messages`, { method: "POST", body: JSON.stringify({ text: limpo }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível enviar." };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}
