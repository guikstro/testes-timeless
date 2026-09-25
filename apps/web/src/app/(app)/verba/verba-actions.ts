"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError, rota } from "@/lib/api-client";

export interface EstadoDaVerba {
  erro?: string;
  okEm?: number;
}

/** Converte "5.000,00" ou "5000" em centavos, sem passar por ponto flutuante. */
function paraCentavos(bruto: string): number | null {
  const limpo = bruto.trim().replace(/[R$\s.]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const [inteiros, decimais = ""] = limpo.split(".");
  return Number(inteiros) * 100 + Number(decimais.padEnd(2, "0"));
}

export async function salvarVerba(
  _anterior: EstadoDaVerba,
  formData: FormData,
): Promise<EstadoDaVerba> {
  const id = String(formData.get("id") ?? "").trim();
  const de = String(formData.get("de") ?? "");
  const ate = String(formData.get("ate") ?? "").trim();
  const valor = paraCentavos(String(formData.get("valor") ?? ""));
  const rotulo = String(formData.get("rotulo") ?? "").trim();

  if (!de) return { erro: "Diga a partir de quando esta verba vale." };
  if (valor === null) return { erro: "Valor inválido. Use algo como 5.000,00." };
  if (ate && ate < de) return { erro: "A data final precisa ser igual ou depois da inicial." };

  try {
    await apiFetch(id ? rota`/verbas/${id}` : "/verbas", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify({ de, ate: ate || undefined, valorCentavos: valor, rotulo: rotulo || undefined }),
    });
  } catch (erro) {
    if (erro instanceof ApiRequestError) return { erro: erro.body.message };
    return { erro: "Não foi possível salvar a verba." };
  }

  revalidatePath("/verba");
  return { okEm: Date.now() };
}

export async function removerVerba(id: string): Promise<void> {
  try {
    await apiFetch(rota`/verbas/${id}`, { method: "DELETE" });
  } catch {
    // A tela relista de qualquer forma; falhar aqui não pode derrubar a ação.
  }
  revalidatePath("/verba");
}
