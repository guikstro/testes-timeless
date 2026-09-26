"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface NovoClienteState {
  error?: string;
}

export interface LinkGerado {
  url: string;
  expiraEm: string;
}

function mensagemDe(error: unknown, padrao: string): string {
  return error instanceof ApiRequestError ? error.body.message : padrao;
}

export async function criaCliente(_anterior: NovoClienteState, formData: FormData): Promise<NovoClienteState> {
  const nome = String(formData.get("nome") ?? "").trim();
  const cor = String(formData.get("cor") ?? "").trim();
  if (nome.length < 2) return { error: "Informe o nome do cliente." };

  let cliente: { id: string };
  try {
    cliente = await apiFetch<{ id: string }>("/admin/organizations", { method: "POST", body: JSON.stringify({ nome, cor }) });
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível criar o cliente.") };
  }

  redirect(`/clientes/${cliente.id}`);
}

export async function geraLink(organizationId: string): Promise<LinkGerado | { error: string }> {
  try {
    const link = await apiFetch<LinkGerado>(`/admin/organizations/${organizationId}/whatsapp/link`, { method: "POST" });
    revalidatePath(`/clientes/${organizationId}`);
    return link;
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível gerar o link.") };
  }
}

/**
 * Entra no cliente para ver o painel dele. Troca a sessão deste navegador:
 * para voltar à Timeless, é "Sair do cliente" e entrar de novo.
 */
export async function entra(organizationId: string): Promise<{ error: string }> {
  let codigo: string;
  try {
    const resposta = await apiFetch<{ entrega: string }>(`/admin/organizations/${organizationId}/entrada`, { method: "POST" });
    codigo = resposta.entrega;
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível entrar neste cliente.") };
  }
  redirect(`/entrar-como?codigo=${encodeURIComponent(codigo)}`);
}

export async function desconecta(organizationId: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/whatsapp/desconectar`, { method: "POST" });
    revalidatePath(`/clientes/${organizationId}`);
    return {};
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível desconectar.") };
  }
}
