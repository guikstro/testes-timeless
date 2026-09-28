"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError, rota } from "@/lib/api-client";
import { guardaSessao, ParDeTokens } from "@/lib/guarda-sessao";

export interface EstadoDaEquipe {
  erro?: string;
}

export async function mudarPapel(userId: string, role: string): Promise<EstadoDaEquipe> {
  try {
    await apiFetch(rota`/organizations/current/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível mudar o papel." };
  }

  revalidatePath("/settings");
  return {};
}

export async function removerMembro(userId: string): Promise<EstadoDaEquipe> {
  try {
    await apiFetch(rota`/organizations/current/members/${userId}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível remover." };
  }

  revalidatePath("/settings");
  return {};
}

/**
 * Passa a posse da conta da equipe. A API confere o código do autenticador e
 * devolve a sessão de quem transferiu já como administrador, que fica gravada
 * aqui para a tela deixar de tratá-lo como dono na hora.
 */
export async function transferirPosse(userId: string, codigo: string): Promise<EstadoDaEquipe> {
  try {
    const tokens = await apiFetch<ParDeTokens>("/organizations/current/transferir-posse", {
      method: "POST",
      body: JSON.stringify({ userId, codigo }),
    });
    await guardaSessao(tokens);
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível transferir a posse." };
  }

  revalidatePath("/settings");
  return {};
}
