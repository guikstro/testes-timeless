"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError, rota } from "@/lib/api-client";

export interface EstadoDoFormulario {
  error?: string;
  ok?: boolean;
}

/** Dá acesso à administração a quem já tem conta, ou muda o nível de quem já é da equipe. */
export async function salvaPessoaDaEquipe(_anterior: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!email) return { error: "Informe o e-mail." };
  if (role !== "SUPPORT" && role !== "ADMIN") return { error: "Escolha se é sócio ou operador." };

  try {
    await apiFetch("/admin/operators", { method: "PUT", body: JSON.stringify({ email, role }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível salvar." };
  }
  revalidatePath("/equipe");
  return { ok: true };
}

export async function revogaAcesso(userId: string): Promise<EstadoDoFormulario> {
  try {
    await apiFetch(rota`/admin/operators/${userId}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível revogar." };
  }
  revalidatePath("/equipe");
  return { ok: true };
}

/** Define quem da equipe atende o cliente. Só sócio. */
export async function defineQuemAtende(organizationId: string, userIds: string[]): Promise<EstadoDoFormulario> {
  try {
    await apiFetch(rota`/admin/organizations/${organizationId}/operadores`, { method: "PUT", body: JSON.stringify({ userIds }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.body.message };
    return { error: "Não foi possível salvar." };
  }
  revalidatePath(`/clientes/${organizationId}`);
  revalidatePath("/equipe");
  return { ok: true };
}
