"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDasAcoes {
  erro?: string;
  salvoEm?: number;
}

export async function salvarAcoesDeConversao(
  _anterior: EstadoDasAcoes,
  formData: FormData,
): Promise<EstadoDasAcoes> {
  const qualificado = String(formData.get("googleConversionQualified") ?? "").trim();
  const venda = String(formData.get("googleConversionWon") ?? "").trim();

  try {
    // String vazia é "limpar", como no resto do formulário da organização.
    await apiFetch("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({ googleConversionQualified: qualificado, googleConversionWon: venda }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível salvar os nomes." };
  }

  revalidatePath("/integrations/google");
  return { salvoEm: Date.now() };
}

/**
 * Avisa a auditoria de que a planilha foi baixada. Uma falha aqui não impede
 * o download: quem baixou não deve ficar sem o arquivo por causa do registro,
 * e o erro fica no log do servidor.
 */
export async function registraExportacao(dias: number, linhas: number): Promise<void> {
  try {
    await apiFetch("/integrations/google/conversions/exportacao", {
      method: "POST",
      body: JSON.stringify({ dias, linhas }),
    });
  } catch {
    // Silencioso de propósito; ver acima.
  }
}
